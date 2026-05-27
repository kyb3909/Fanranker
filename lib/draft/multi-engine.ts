/**
 * 멀티플레이어 드래프트 서버 엔진.
 *
 * 솔로 모드(`engine.ts`)의 로직을 DB-backed 버전으로 옮긴 것.
 * 모든 mutation 은 service role 통과. 클라이언트는 API route 통해서만 호출.
 *
 * PRD: docs/PRD-draft-multiplayer.md §5, §7
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { FORMATIONS, type Formation } from "./engine"
import type { Player, Position } from "./players"
import { getServerPlayers, getServerPlayerById } from "./server-players"
import {
  AI_FILL_NAMES,
  PICK_DURATION_SECONDS,
  RECONNECT_GRACE_SECONDS,
  WAITING_ROOM_MAX_MINUTES,
  type DraftRoom,
  type DraftRoomSeat,
  type DraftRoomWithSeats,
} from "./rooms"

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface DraftPickRow {
  id: string
  room_id: string
  pick_number: number
  seat_index: number
  player_id: string
  is_auto_pick: boolean
  picked_at: string
}

export interface DraftRoomFullState extends DraftRoomWithSeats {
  picks: DraftPickRow[]
}

// ─────────────────────────────────────────────
// 상태 조회 (방 + 좌석 + 픽)
// ─────────────────────────────────────────────

export async function getRoomFullState(roomId: string): Promise<DraftRoomFullState | null> {
  const supabase = createServiceRoleClient()

  const { data: room } = await supabase
    .from("draft_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle<DraftRoom>()
  if (!room) return null

  const { data: seats } = await supabase
    .from("draft_room_seats")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true })
    .returns<DraftRoomSeat[]>()

  const { data: picks } = await supabase
    .from("draft_room_picks")
    .select("*")
    .eq("room_id", roomId)
    .order("pick_number", { ascending: true })
    .returns<DraftPickRow[]>()

  return {
    ...room,
    seats: seats ?? [],
    picks: picks ?? [],
  }
}

// ─────────────────────────────────────────────
// 게임 시작 (호스트 액션)
// ─────────────────────────────────────────────

export class StartRoomError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * 호스트가 "지금 시작" 클릭 → 게임 시작.
 * - 빈 좌석을 AI 로 채움
 * - snake_order 랜덤 셔플
 * - status='drafting' + pick_deadline_at 설정
 * - system_start 메시지 INSERT
 */
export async function startRoom(roomId: string, userId: string): Promise<DraftRoomFullState> {
  const supabase = createServiceRoleClient()
  const state = await getRoomFullState(roomId)
  if (!state) throw new StartRoomError("not_found", "방을 찾을 수 없습니다")

  if (state.status !== "waiting") {
    throw new StartRoomError("not_waiting", "대기 상태가 아닙니다")
  }

  // 호스트 검증
  const hostSeat = state.seats.find((s) => s.user_id === userId && s.is_host && s.left_at === null)
  if (!hostSeat) {
    throw new StartRoomError("not_host", "호스트만 시작할 수 있습니다")
  }

  const activeSeats = state.seats.filter((s) => !s.left_at)
  if (activeSeats.length < 1) {
    throw new StartRoomError("empty", "최소 1명의 참가자가 필요합니다")
  }

  // 빈 좌석 AI fill
  const occupied = new Set(activeSeats.map((s) => s.seat_index))
  const aiInserts: Array<{
    room_id: string
    seat_index: number
    user_id: null
    display_name: string
    is_ai: boolean
    ai_name: string
  }> = []
  let aiNameIdx = 0
  for (let i = 0; i < state.max_participants; i++) {
    if (occupied.has(i)) continue
    const aiName = AI_FILL_NAMES[aiNameIdx % AI_FILL_NAMES.length]!
    aiNameIdx++
    aiInserts.push({
      room_id: roomId,
      seat_index: i,
      user_id: null,
      display_name: aiName,
      is_ai: true,
      ai_name: aiName,
    })
  }

  if (aiInserts.length > 0) {
    // 이전 left_at 처리된 같은 좌석 cleanup
    for (const seat of aiInserts) {
      await supabase
        .from("draft_room_seats")
        .delete()
        .eq("room_id", roomId)
        .eq("seat_index", seat.seat_index)
        .not("left_at", "is", null)
    }
    const { error } = await supabase.from("draft_room_seats").insert(aiInserts)
    if (error) throw new StartRoomError("ai_fill_failed", error.message)
  }

  // 스네이크 순서 랜덤 셔플 (참가자 수 = max_participants)
  const seatIndexes = Array.from({ length: state.max_participants }, (_, i) => i)
  shuffleInPlace(seatIndexes)

  // snake order: round 0 = seatIndexes, round 1 = reverse, ...
  const totalRounds = state.total_rounds
  const fullOrder: number[] = []
  for (let r = 0; r < totalRounds; r++) {
    const round = r % 2 === 0 ? seatIndexes : [...seatIndexes].reverse()
    fullOrder.push(...round)
  }

  const now = new Date()
  const deadline = new Date(now.getTime() + PICK_DURATION_SECONDS * 1000)

  const { error: updateErr } = await supabase
    .from("draft_rooms")
    .update({
      status: "drafting",
      snake_order: fullOrder,
      current_pick: 0,
      pick_deadline_at: deadline.toISOString(),
      drafting_started_at: now.toISOString(),
      last_activity_at: now.toISOString(),
    })
    .eq("id", roomId)
  if (updateErr) throw new StartRoomError("update_failed", updateErr.message)

  await supabase.from("draft_room_messages").insert({
    room_id: roomId,
    user_id: null,
    display_name: "시스템",
    kind: "system_start",
    body: null,
    payload: { snake_order: fullOrder, ai_fill_count: aiInserts.length },
  })

  // AI 가 첫 픽이면 즉시 AI 픽 chain
  const refreshed = await getRoomFullState(roomId)
  if (refreshed) {
    await runAiPicksIfNeeded(refreshed)
  }
  return (await getRoomFullState(roomId))!
}

// ─────────────────────────────────────────────
// 픽 실행 (사용자 또는 자동/AI)
// ─────────────────────────────────────────────

export class PickError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

interface PickParams {
  roomId: string
  /** null 이면 서버 측 자동 픽 (AI 또는 timeout). non-null 이면 사용자 액션 */
  userId: string | null
  playerId: string
  isAutoPick?: boolean
}

/**
 * 픽 적용. 차례/예산/슬롯 검증 → INSERT → current_pick++ → 다음 deadline.
 * AI 차례라면 끝나고 chain 호출.
 */
export async function pickPlayer(params: PickParams): Promise<DraftRoomFullState> {
  const supabase = createServiceRoleClient()
  const state = await getRoomFullState(params.roomId)
  if (!state) throw new PickError("not_found", "방을 찾을 수 없습니다")
  if (state.status !== "drafting") {
    throw new PickError("not_drafting", "진행 중이 아닙니다")
  }

  const currentSeatIdx = state.snake_order?.[state.current_pick]
  if (currentSeatIdx === undefined) {
    throw new PickError("invalid_pick_index", "픽 인덱스가 유효하지 않습니다")
  }

  const currentSeat = state.seats.find((s) => s.seat_index === currentSeatIdx && s.left_at === null)
  if (!currentSeat) {
    throw new PickError("seat_missing", "현재 차례 좌석이 없습니다")
  }

  // 사용자 액션이면 본인인지 확인
  if (params.userId !== null) {
    if (currentSeat.user_id !== params.userId) {
      throw new PickError("not_your_turn", "당신 차례가 아닙니다")
    }
    if (currentSeat.is_ai) {
      throw new PickError("seat_ai", "AI 좌석은 직접 픽할 수 없습니다")
    }
  }

  const player = await getServerPlayerById(params.playerId)
  if (!player) throw new PickError("player_not_found", "선수를 찾을 수 없습니다")

  // 중복 픽 검증
  if (state.picks.some((p) => p.player_id === player.id)) {
    throw new PickError("already_picked", "이미 픽된 선수입니다")
  }

  // 예산/슬롯 검증
  const formation = (state.formation ?? "4-3-3") as Formation
  const limits = FORMATIONS[formation]
  const seatRoster = state.picks
    .filter((p) => p.seat_index === currentSeatIdx)
    .map((p) => p.player_id)

  const allPlayersList = await getServerPlayers()
  const playerById = new Map(allPlayersList.map((p) => [p.id, p]))
  const seatPlayers = seatRoster.map((id) => playerById.get(id)).filter((p): p is Player => !!p)

  const used = seatPlayers.reduce((s, p) => s + p.price, 0)
  if (used + player.price > state.budget) {
    throw new PickError("over_budget", "예산을 초과합니다")
  }

  const posCounts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const p of seatPlayers) posCounts[p.position]++
  if (posCounts[player.position] >= limits[player.position]) {
    throw new PickError("slot_full", "해당 포지션 슬롯이 가득 찼습니다")
  }

  // INSERT pick
  const { error: pickErr } = await supabase.from("draft_room_picks").insert({
    room_id: state.id,
    pick_number: state.current_pick,
    seat_index: currentSeatIdx,
    player_id: player.id,
    is_auto_pick: !!params.isAutoPick,
  })
  if (pickErr) {
    // 동시 픽 race — 같은 player_id unique constraint
    if (pickErr.code === "23505") {
      throw new PickError("already_picked", "이미 누가 픽했어요")
    }
    throw new PickError("insert_failed", pickErr.message)
  }

  // current_pick 증가 + 다음 deadline
  const nextPickIdx = state.current_pick + 1
  const totalPicks = state.snake_order?.length ?? 0
  const isCompleted = nextPickIdx >= totalPicks
  const now = new Date()
  const deadline = isCompleted ? null : new Date(now.getTime() + PICK_DURATION_SECONDS * 1000)

  const { error: updateErr } = await supabase
    .from("draft_rooms")
    .update({
      current_pick: nextPickIdx,
      pick_deadline_at: deadline?.toISOString() ?? null,
      status: isCompleted ? "completed" : "drafting",
      completed_at: isCompleted ? now.toISOString() : null,
      last_activity_at: now.toISOString(),
    })
    .eq("id", state.id)
  if (updateErr) throw new PickError("update_failed", updateErr.message)

  // 시스템 메시지 (pick) - 비AI 좌석일 때만 (AI 픽은 시끄러우니 생략)
  if (!currentSeat.is_ai) {
    await supabase.from("draft_room_messages").insert({
      room_id: state.id,
      user_id: null,
      display_name: currentSeat.display_name,
      kind: "system_pick",
      body: null,
      payload: {
        pick_number: state.current_pick,
        seat_index: currentSeatIdx,
        player_id: player.id,
        player_name: player.nameKo,
        is_auto_pick: !!params.isAutoPick,
      },
    })
  }

  if (isCompleted) {
    await supabase.from("draft_room_messages").insert({
      room_id: state.id,
      user_id: null,
      display_name: "시스템",
      kind: "system_complete",
      body: null,
      payload: null,
    })
  }

  // AI 차례면 chain
  const next = await getRoomFullState(state.id)
  if (next && !isCompleted) {
    await runAiPicksIfNeeded(next)
  }

  return (await getRoomFullState(state.id))!
}

/**
 * 현재 픽이 AI 좌석이면 즉시 자동 픽. 연속해서 AI 차례면 chain.
 * 무한 루프 보호: 최대 max_participants * total_rounds 회.
 */
async function runAiPicksIfNeeded(state: DraftRoomFullState): Promise<void> {
  let current = state
  const maxIter = current.max_participants * current.total_rounds + 10
  for (let i = 0; i < maxIter; i++) {
    if (current.status !== "drafting") return
    const seatIdx = current.snake_order?.[current.current_pick]
    if (seatIdx === undefined) return
    const seat = current.seats.find((s) => s.seat_index === seatIdx && s.left_at === null)
    if (!seat) return
    if (!seat.is_ai) return

    // AI 픽 추천
    const pickId = await pickRecommendation(current, seatIdx)
    if (!pickId) return

    await pickPlayer({
      roomId: current.id,
      userId: null,
      playerId: pickId,
      isAutoPick: true,
    }).catch((err) => {
      console.warn("[ai-pick] failed:", err)
    })
    const next = await getRoomFullState(current.id)
    if (!next) return
    current = next
  }
}

/**
 * AI/timeout 자동 픽용 추천 선수 — engine.ts 의 getAIPick 와 유사한 휴리스틱.
 */
export async function pickRecommendation(
  state: DraftRoomFullState,
  seatIndex: number
): Promise<string | null> {
  const all = await getServerPlayers()
  const formation = (state.formation ?? "4-3-3") as Formation
  const limits = FORMATIONS[formation]
  const draftedIds = new Set(state.picks.map((p) => p.player_id))
  const seatPicks = state.picks.filter((p) => p.seat_index === seatIndex).map((p) => p.player_id)

  const playerById = new Map(all.map((p) => [p.id, p]))
  const seatPlayers = seatPicks.map((id) => playerById.get(id)).filter((p): p is Player => !!p)
  const used = seatPlayers.reduce((s, p) => s + p.price, 0)
  const budget = state.budget - used
  const posCounts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const p of seatPlayers) posCounts[p.position]++

  // 남은 슬롯 수
  const totalSlots = limits.GK + limits.DF + limits.MF + limits.FW
  const remaining = totalSlots - seatPlayers.length

  // 긴급 포지션 (남은 슬롯으로 안 채워지면 안 되는 포지션)
  let otherNeeded = 0
  const urgentPositions: Position[] = []
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const needed = limits[pos] - posCounts[pos]
    if (needed > 0) {
      otherNeeded += needed
      if (remaining <= otherNeeded + 1) urgentPositions.push(pos)
    }
  }

  // 후보 필터
  let candidates = all.filter((p) => {
    if (draftedIds.has(p.id)) return false
    if (p.price > budget) return false
    if (posCounts[p.position] >= limits[p.position]) return false
    return true
  })
  if (urgentPositions.length > 0) {
    const urgent = candidates.filter((p) => urgentPositions.includes(p.position))
    if (urgent.length > 0) candidates = urgent
  }
  if (candidates.length === 0) return null

  // 가성비: 가격 높을수록 좋고, 동가격이면 random
  candidates.sort((a, b) => b.price - a.price + (Math.random() - 0.5) * 0.1)
  return candidates[0]!.id
}

// ─────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

// ─────────────────────────────────────────────
// Phase 3E — 이탈/AI 대체/cleanup
// ─────────────────────────────────────────────

interface StaleSeatRow {
  id: string
  room_id: string
  seat_index: number
  display_name: string
  disconnected_at: string
}

interface CleanupSummary {
  staleSeatsConverted: number
  staleRoomsAbandoned: number
  affectedRoomIds: string[]
}

/**
 * 진행 중인 게임에서 30초 이상 disconnected 좌석을 AI 로 전환.
 * 본인 차례 좌석이 AI 로 바뀌면 즉시 자동 픽 진행.
 */
export async function convertStaleSeatsToAi(): Promise<{
  converted: number
  affectedRoomIds: string[]
}> {
  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - RECONNECT_GRACE_SECONDS * 1000).toISOString()

  // disconnected_at 이 cutoff 보다 이전인 사람 좌석 (drafting 중인 방만)
  const { data: stale } = await supabase
    .from("draft_room_seats")
    .select("id, room_id, seat_index, display_name, disconnected_at, draft_rooms!inner(status)")
    .lt("disconnected_at", cutoff)
    .is("left_at", null)
    .eq("is_ai", false)
    .eq("draft_rooms.status", "drafting")
    .returns<(StaleSeatRow & { draft_rooms: { status: string } })[]>()

  if (!stale?.length) {
    return { converted: 0, affectedRoomIds: [] }
  }

  const affected = new Set<string>()
  let converted = 0

  for (const seat of stale) {
    const aiName = AI_FILL_NAMES[seat.seat_index % AI_FILL_NAMES.length] ?? "AI"
    const { error } = await supabase
      .from("draft_room_seats")
      .update({
        is_ai: true,
        ai_name: aiName,
        display_name: aiName,
        user_id: null,
        disconnected_at: null,
      })
      .eq("id", seat.id)
    if (error) {
      console.warn(`[cleanup] seat ${seat.id} convert failed:`, error.message)
      continue
    }
    converted++
    affected.add(seat.room_id)

    await supabase.from("draft_room_messages").insert({
      room_id: seat.room_id,
      user_id: null,
      display_name: seat.display_name,
      kind: "system_leave",
      body: null,
      payload: {
        seat_index: seat.seat_index,
        reason: "ai_takeover",
        ai_name: aiName,
      },
    })
  }

  // 영향받은 각 방에서 AI 차례면 즉시 chain
  for (const roomId of affected) {
    const state = await getRoomFullState(roomId)
    if (state && state.status === "drafting") {
      await runAiPicksIfNeeded(state).catch((err) => {
        console.warn(`[cleanup] ai-chain ${roomId} failed:`, err)
      })
    }
  }

  return { converted, affectedRoomIds: Array.from(affected) }
}

/**
 * 30분 이상 대기 중인 방을 abandoned 처리.
 */
export async function markStaleWaitingRoomsAbandoned(): Promise<{
  abandoned: number
  affectedRoomIds: string[]
}> {
  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - WAITING_ROOM_MAX_MINUTES * 60 * 1000).toISOString()

  const { data: stale } = await supabase
    .from("draft_rooms")
    .select("id")
    .eq("status", "waiting")
    .lt("last_activity_at", cutoff)
    .returns<{ id: string }[]>()

  if (!stale?.length) {
    return { abandoned: 0, affectedRoomIds: [] }
  }

  const ids = stale.map((r) => r.id)
  const { error } = await supabase.from("draft_rooms").update({ status: "abandoned" }).in("id", ids)
  if (error) {
    console.warn(`[cleanup] abandon failed:`, error.message)
    return { abandoned: 0, affectedRoomIds: [] }
  }

  return { abandoned: ids.length, affectedRoomIds: ids }
}

/**
 * 모든 cleanup 작업을 한 번에. cron 진입점이 호출.
 */
export async function runDraftRoomCleanup(): Promise<CleanupSummary> {
  const aiResult = await convertStaleSeatsToAi()
  const abandonResult = await markStaleWaitingRoomsAbandoned()
  return {
    staleSeatsConverted: aiResult.converted,
    staleRoomsAbandoned: abandonResult.abandoned,
    affectedRoomIds: [...aiResult.affectedRoomIds, ...abandonResult.affectedRoomIds],
  }
}
