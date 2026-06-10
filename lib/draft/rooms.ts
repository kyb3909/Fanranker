/**
 * 드래프트 멀티플레이어 방 — 서버 헬퍼.
 *
 * 모든 mutation 은 service role 통과. RLS 우회.
 * PRD: docs/PRD-draft-multiplayer.md
 *
 * 호출처는 항상 `app/api/draft-rooms/**` API route — 클라에서 직접 호출 금지.
 */

import { randomBytes } from "crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"

// ─────────────────────────────────────────────
// 타입 정의 (database.types.ts 갱신 전까지 inline)
// ─────────────────────────────────────────────

type DraftRoomStatus = "waiting" | "drafting" | "completed" | "abandoned"

export interface DraftRoom {
  id: string
  invite_code: string
  host_user_id: string
  game_slug: string
  status: DraftRoomStatus
  is_private: boolean
  max_participants: number
  formation: string | null
  budget: number
  total_rounds: number
  snake_order: number[] | null
  current_pick: number
  pick_deadline_at: string | null
  drafting_started_at: string | null
  completed_at: string | null
  created_at: string
  last_activity_at: string
}

export interface DraftRoomSeat {
  id: string
  room_id: string
  seat_index: number
  user_id: string | null
  display_name: string
  is_ai: boolean
  ai_name: string | null
  is_ready: boolean
  is_host: boolean
  joined_at: string
  left_at: string | null
  disconnected_at: string | null
}

export interface DraftRoomWithSeats extends DraftRoom {
  seats: DraftRoomSeat[]
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

/** invite_code 풀: 혼동 글자(0/O/1/I/L) 제외 32자. */
const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const INVITE_CODE_LENGTH = 6

/** AI fill 시 이름 풀. 솔로 모드와 동일 (use-draft-game.ts). */
export const AI_FILL_NAMES = ["공돌이", "에디터J", "늦슛", "상상마차"]

/** 진행 중 이탈 후 AI 전환까지 grace 시간. */
export const RECONNECT_GRACE_SECONDS = 30

/** 픽 deadline. */
export const PICK_DURATION_SECONDS = 30

/** 대기실 max waiting 시간 (이후 cleanup cron이 archive). */
export const WAITING_ROOM_MAX_MINUTES = 30

// ─────────────────────────────────────────────
// invite_code 생성
// ─────────────────────────────────────────────

function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH)
  let code = ""
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i]! % INVITE_CODE_ALPHABET.length]
  }
  return code
}

// ─────────────────────────────────────────────
// 방 생성 / 조회 / 이탈 / 합류
// ─────────────────────────────────────────────

interface CreateRoomParams {
  hostUserId: string
  hostDisplayName: string
  gameSlug?: string
  formation?: string
  isPrivate?: boolean
  maxParticipants?: number
}

/**
 * 방 생성 + 호스트 좌석 0번 점유.
 * 같은 사용자가 이미 active 방에 있으면 그 방에서 자동 leave 처리.
 */
export async function createRoom(params: CreateRoomParams): Promise<DraftRoomWithSeats> {
  const supabase = createServiceRoleClient()

  // 이미 active 방에 있으면 leave 처리
  await leaveAllActiveRooms(params.hostUserId)

  // invite_code 충돌 회피 — 최대 5번 재시도
  let inviteCode = generateInviteCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("draft_rooms")
      .select("id")
      .eq("invite_code", inviteCode)
      .in("status", ["waiting", "drafting"])
      .maybeSingle()
    if (!existing) break
    inviteCode = generateInviteCode()
  }

  const { data: room, error: roomErr } = await supabase
    .from("draft_rooms")
    .insert({
      invite_code: inviteCode,
      host_user_id: params.hostUserId,
      game_slug: params.gameSlug ?? "epl",
      formation: params.formation ?? "4-3-3",
      is_private: params.isPrivate ?? false,
      max_participants: params.maxParticipants ?? 4,
      status: "waiting",
    })
    .select("*")
    .single<DraftRoom>()

  if (roomErr || !room) {
    throw new Error(`Failed to create room: ${roomErr?.message ?? "unknown"}`)
  }

  // 호스트 좌석 0번
  const { error: seatErr } = await supabase.from("draft_room_seats").insert({
    room_id: room.id,
    seat_index: 0,
    user_id: params.hostUserId,
    display_name: params.hostDisplayName,
    is_host: true,
  })

  if (seatErr) {
    // 좌석 생성 실패 시 방도 롤백
    await supabase.from("draft_rooms").delete().eq("id", room.id)
    throw new Error(`Failed to create host seat: ${seatErr.message}`)
  }

  await insertSystemMessage(room.id, "system_join", params.hostDisplayName, {
    user_id: params.hostUserId,
    seat_index: 0,
  })

  return getRoomWithSeats(room.id)
}

/**
 * 방 + 좌석 한 번에 fetch.
 */
export async function getRoomWithSeats(roomId: string): Promise<DraftRoomWithSeats> {
  const supabase = createServiceRoleClient()

  const { data: room, error: roomErr } = await supabase
    .from("draft_rooms")
    .select("*")
    .eq("id", roomId)
    .single<DraftRoom>()
  if (roomErr || !room) {
    throw new Error(`Room not found: ${roomId}`)
  }

  const { data: seats, error: seatsErr } = await supabase
    .from("draft_room_seats")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true })
    .returns<DraftRoomSeat[]>()
  if (seatsErr) {
    throw new Error(`Failed to fetch seats: ${seatsErr.message}`)
  }

  return { ...room, seats: seats ?? [] }
}

/**
 * invite_code 로 방 찾기 (대기/진행 중인 방만).
 */
export async function findRoomByInviteCode(inviteCode: string): Promise<DraftRoom | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("draft_rooms")
    .select("*")
    .eq("invite_code", inviteCode.toUpperCase())
    .in("status", ["waiting", "drafting"])
    .maybeSingle<DraftRoom>()
  return data ?? null
}

interface JoinRoomParams {
  roomId: string
  userId: string
  displayName: string
}

/**
 * 빈 좌석에 합류. 이미 있는 사용자면 noop (idempotent).
 */
export async function joinRoom(params: JoinRoomParams): Promise<DraftRoomWithSeats> {
  const supabase = createServiceRoleClient()
  const room = await getRoomWithSeats(params.roomId)

  if (room.status !== "waiting") {
    // drafting 중이면 본인이 이미 좌석 보유한 경우에만 재접속 허용
    const existing = room.seats.find((s) => s.user_id === params.userId && s.left_at === null)
    if (existing) {
      // 재접속 — disconnected_at 클리어
      if (existing.disconnected_at) {
        await supabase
          .from("draft_room_seats")
          .update({ disconnected_at: null })
          .eq("id", existing.id)
      }
      return getRoomWithSeats(params.roomId)
    }
    throw new Error("Room is no longer accepting new participants")
  }

  // 이미 좌석 보유?
  const existing = room.seats.find((s) => s.user_id === params.userId && s.left_at === null)
  if (existing) {
    return room
  }

  // 다른 active 방에서 leave
  await leaveAllActiveRooms(params.userId)

  // 빈 좌석 찾기 (left_at 처리된 자리는 재사용 가능)
  const occupied = new Set(room.seats.filter((s) => s.left_at === null).map((s) => s.seat_index))
  let seatIndex = -1
  for (let i = 0; i < room.max_participants; i++) {
    if (!occupied.has(i)) {
      seatIndex = i
      break
    }
  }
  if (seatIndex < 0) {
    throw new Error("Room is full")
  }

  // 기존에 같은 자리 left_at 처리된 행 있으면 삭제 후 새로 INSERT
  await supabase
    .from("draft_room_seats")
    .delete()
    .eq("room_id", params.roomId)
    .eq("seat_index", seatIndex)
    .not("left_at", "is", null)

  const { error: seatErr } = await supabase.from("draft_room_seats").insert({
    room_id: params.roomId,
    seat_index: seatIndex,
    user_id: params.userId,
    display_name: params.displayName,
  })
  if (seatErr) {
    throw new Error(`Failed to join: ${seatErr.message}`)
  }

  await touchRoom(params.roomId)
  await insertSystemMessage(params.roomId, "system_join", params.displayName, {
    user_id: params.userId,
    seat_index: seatIndex,
  })

  return getRoomWithSeats(params.roomId)
}

/**
 * 좌석 떠나기. 호스트면 다음 사람에게 자동 승계.
 * 모두 떠나면 방 abandoned.
 */
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const room = await getRoomWithSeats(roomId)
  const seat = room.seats.find((s) => s.user_id === userId && s.left_at === null)
  if (!seat) return // 이미 나간 상태

  const wasHost = seat.is_host

  await supabase
    .from("draft_room_seats")
    .update({ left_at: new Date().toISOString() })
    .eq("id", seat.id)

  await insertSystemMessage(roomId, "system_leave", seat.display_name, {
    user_id: userId,
    seat_index: seat.seat_index,
  })

  const remaining = room.seats.filter((s) => s.id !== seat.id && s.left_at === null && !s.is_ai)

  if (remaining.length === 0) {
    // 다 떠남 → 방 abandoned
    await supabase.from("draft_rooms").update({ status: "abandoned" }).eq("id", roomId)
    return
  }

  if (wasHost) {
    // 가장 먼저 들어온 사람에게 승계
    const newHost = remaining.reduce((earliest, s) =>
      s.joined_at < earliest.joined_at ? s : earliest
    )
    await supabase.from("draft_room_seats").update({ is_host: true }).eq("id", newHost.id)
    await supabase.from("draft_rooms").update({ host_user_id: newHost.user_id }).eq("id", roomId)
    await insertSystemMessage(roomId, "system_host_change", newHost.display_name, {
      user_id: newHost.user_id,
      seat_index: newHost.seat_index,
    })
  }

  await touchRoom(roomId)
}

/**
 * 한 사용자가 active(waiting/drafting) 방에 좌석 있으면 모두 leave 처리.
 * 새 방 만들거나 다른 방 합류 시 호출.
 */
async function leaveAllActiveRooms(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: activeSeats } = await supabase
    .from("draft_room_seats")
    .select("room_id, id")
    .eq("user_id", userId)
    .is("left_at", null)
    .returns<{ room_id: string; id: string }[]>()

  if (!activeSeats?.length) return

  for (const seat of activeSeats) {
    await leaveRoom(seat.room_id, userId).catch((err) => {
      console.warn(`Failed to leave room ${seat.room_id}:`, err)
    })
  }
}

// ─────────────────────────────────────────────
// 공개 방 목록
// ─────────────────────────────────────────────

export interface OpenRoomSummary {
  id: string
  invite_code: string
  host_display_name: string
  game_slug: string
  formation: string | null
  current_count: number
  max_participants: number
  created_at: string
  last_activity_at: string
}

/**
 * 공개 대기 방 목록 (status='waiting' AND NOT private).
 * 인원 수 + 호스트 닉네임 포함.
 */
export async function listOpenRooms(limit = 24): Promise<OpenRoomSummary[]> {
  const supabase = createServiceRoleClient()

  const { data: rooms } = await supabase
    .from("draft_rooms")
    .select("*")
    .eq("status", "waiting")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<DraftRoom[]>()

  if (!rooms?.length) return []

  // 좌석 카운트 + 호스트 닉네임 한 번에
  const roomIds = rooms.map((r) => r.id)
  const { data: seats } = await supabase
    .from("draft_room_seats")
    .select("room_id, display_name, is_host, left_at")
    .in("room_id", roomIds)
    .returns<
      {
        room_id: string
        display_name: string
        is_host: boolean
        left_at: string | null
      }[]
    >()

  const byRoom = new Map<string, { count: number; host_display_name: string }>()
  for (const seat of seats ?? []) {
    if (seat.left_at) continue
    const entry = byRoom.get(seat.room_id) ?? {
      count: 0,
      host_display_name: "?",
    }
    entry.count++
    if (seat.is_host) entry.host_display_name = seat.display_name
    byRoom.set(seat.room_id, entry)
  }

  return rooms
    .filter((r) => (byRoom.get(r.id)?.count ?? 0) > 0)
    .map((r) => {
      const entry = byRoom.get(r.id)!
      return {
        id: r.id,
        invite_code: r.invite_code,
        host_display_name: entry.host_display_name,
        game_slug: r.game_slug,
        formation: r.formation,
        current_count: entry.count,
        max_participants: r.max_participants,
        created_at: r.created_at,
        last_activity_at: r.last_activity_at,
      }
    })
}

// ─────────────────────────────────────────────
// 시스템 메시지 / activity touch
// ─────────────────────────────────────────────

async function insertSystemMessage(
  roomId: string,
  kind:
    | "system_join"
    | "system_leave"
    | "system_pick"
    | "system_start"
    | "system_complete"
    | "system_host_change",
  displayName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceRoleClient()
  await supabase.from("draft_room_messages").insert({
    room_id: roomId,
    user_id: null,
    display_name: displayName,
    kind,
    body: null,
    payload,
  })
}

async function touchRoom(roomId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  await supabase
    .from("draft_rooms")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", roomId)
}
