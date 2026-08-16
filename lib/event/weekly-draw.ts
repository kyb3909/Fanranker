import "server-only"

import { createHash, randomInt } from "node:crypto"
import type { createServiceRoleClient } from "@/lib/supabase/server"
import {
  computeSeasonStandings,
  fetchAllSeasonPoints,
  SEASON_EVENT_SLUG,
} from "@/lib/event/season-stats"

/**
 * 주간 경품 추첨 — 후보 확정(cron)과 추첨 실행(어드민)이 공유하는 로직.
 *
 * 설계 의도는 마이그레이션 20260803_season_weekly_draw.sql 참조.
 * 핵심: **명단은 시스템이 미리 고정하고, 뽑기만 사람이 한다.**
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** 매주 당첨 인원 (스팀 기프트카드 5만원권) */
export const WEEKLY_WINNER_COUNT = 5

export interface DrawCandidate {
  user_id: string
  nickname: string
  total_points: number
  community_actions: number
  /** 소속 팬덤 — 맞대결 승리 팬덤에서만 뽑는 유니폼 추첨에 필요 */
  group_slug: string
}

interface DrawWinner {
  user_id: string
  nickname: string
  /** 발표 화면에서 팀 색 점을 찍어 "우리 쪽에서 몇 명 나왔나"가 읽히게 한다 */
  group_slug: string
}

/**
 * 주어진 시각이 속한 주의 **월요일(KST)** 을 YYYY-MM-DD 로.
 * 회차 식별자이므로 UTC 로 계산하면 한국 시간 기준 주가 어긋난다.
 */
export function kstWeekStart(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const dow = kst.getUTCDay() // 0=일 … 1=월
  const daysSinceMonday = (dow + 6) % 7
  const monday = new Date(kst.getTime() - daysSinceMonday * 24 * 3600 * 1000)
  return monday.toISOString().slice(0, 10)
}

/**
 * 명단 지문 — user_id 를 정렬해 이어붙인 값의 sha256.
 * 추첨 후 명단이 바뀌지 않았음을 제3자가 검증할 수 있게 남긴다.
 */
export function hashCandidates(userIds: string[]): string {
  return createHash("sha256")
    .update([...userIds].sort().join("\n"))
    .digest("hex")
}

/**
 * 이번 회차 후보 = 응모 자격(포인트 임계 + 커뮤니티 활동 최소치) 충족자 전원.
 * 댓글 수에 비례한 가중치를 주지 않는다 — 도배와 다계정을 동시에 보상하기 때문에
 * 1인 1표 균등으로 간다 (데일리 치킨 추첨이 쓰던 원칙과 동일).
 */
export async function buildCandidates(supabase: ServiceClient): Promise<DrawCandidate[]> {
  const points = await fetchAllSeasonPoints(supabase)
  const qualified = points.filter((p) => p.qualified)
  if (qualified.length === 0) return []

  const nickById = new Map<string, string>()
  const ids = qualified.map((q) => q.userId)
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", ids.slice(i, i + 100))
    for (const p of data ?? []) nickById.set(p.user_id, p.nickname ?? "이름 없는 팬")
  }

  // 소속 팬덤 — 유니폼 추첨이 승리 팬덤으로 한정되므로 후보에 실어둔다.
  // event_registrations 는 월드컵과 공용 — 시즌 이벤트 행만 조회해야 한다
  // (2026-08-08 감사 P1-4: 양쪽 등록 유저의 group_slug 가 월드컵 gooner 로 덮여
  // 유니폼 pool 필터에서 누락될 수 있었음)
  const { data: seasonEvent } = await supabase
    .from("events")
    .select("id")
    .eq("slug", SEASON_EVENT_SLUG)
    .maybeSingle()
  const groupByUser = new Map<string, string>()
  const { data: regs } = seasonEvent
    ? await supabase
        .from("event_registrations")
        .select("user_id, event_groups!inner(slug)")
        .eq("event_id", seasonEvent.id)
    : { data: [] }
  for (const r of (regs ?? []) as unknown as {
    user_id: string
    event_groups: { slug: string }
  }[]) {
    groupByUser.set(r.user_id, r.event_groups.slug)
  }

  return qualified
    .map((q) => ({
      user_id: q.userId,
      nickname: nickById.get(q.userId) ?? "이름 없는 팬",
      total_points: q.totalPoints,
      community_actions: q.communityActions,
      group_slug: groupByUser.get(q.userId) ?? "",
    }))
    .sort((a, b) => a.user_id.localeCompare(b.user_id))
}

/**
 * 후보에서 중복 없이 n 명 추첨 (Fisher–Yates 부분 셔플, CSPRNG).
 * Math.random 을 쓰지 않는다 — 경품이 걸린 추첨이라 예측 가능한 난수는 부적절하다.
 */
export function drawWinners(candidates: DrawCandidate[], n: number): DrawWinner[] {
  const pool = [...candidates]
  const take = Math.min(n, pool.length)
  for (let i = 0; i < take; i++) {
    const j = i + randomInt(pool.length - i)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
    .slice(0, take)
    .map((c) => ({ user_id: c.user_id, nickname: c.nickname, group_slug: c.group_slug }))
}

/* ── 크리에이터 주간 맞대결 ──────────────────────────────────── */

export interface DuelScore {
  group_slug: string
  group_id: string
  captain_user_id: string
  nickname: string
  skill_score: number
  settled_slips: number
}

interface DuelResult {
  scores: DuelScore[]
  /** 승자 팬덤. 무승부·주장 미설정·정산 슬립 0 이면 null (그 주는 유니폼 미지급) */
  winner: DuelScore | null
  reason?: string
}

/**
 * 그 주 범위 성적으로 주장끼리 승부를 가린다.
 *
 * 무승부·미참가는 승자 없음으로 처리한다 — 억지로 한쪽을 올리면 "왜 쟤가 이겼냐"가 되고,
 * 그 주 유니폼은 다음 주로 넘기지 않고 그냥 안 나간다(운영이 단순해야 분쟁이 없다).
 * 정산된 슬립이 0 인 주장은 "예측을 안 한 것"이므로 상대가 슬립을 냈다면 상대가 이긴다.
 */
export async function resolveWeeklyDuel(
  supabase: ServiceClient,
  range: { from: Date; to: Date }
): Promise<DuelResult> {
  const { data: groups } = await supabase
    .from("event_groups")
    .select("id, slug, captain_user_id")
    .not("captain_user_id", "is", null)

  const captains = (groups ?? []) as { id: string; slug: string; captain_user_id: string }[]
  if (captains.length < 2) {
    return {
      scores: [],
      winner: null,
      reason: "주장이 2명 미만 (event_groups.captain_user_id 미설정)",
    }
  }

  const { users } = await computeSeasonStandings(supabase, range)
  const byUser = new Map(users.map((u) => [u.userId, u]))

  const nickById = new Map<string, string>()
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .in(
      "user_id",
      captains.map((c) => c.captain_user_id)
    )
  for (const p of profiles ?? []) nickById.set(p.user_id, p.nickname ?? "이름 없는 팬")

  const scores: DuelScore[] = captains.map((c) => {
    const u = byUser.get(c.captain_user_id)
    return {
      group_slug: c.slug,
      group_id: c.id,
      captain_user_id: c.captain_user_id,
      nickname: nickById.get(c.captain_user_id) ?? "이름 없는 팬",
      skill_score: u?.skillScore ?? 0,
      settled_slips: u?.settledSlips ?? 0,
    }
  })

  return { scores, ...decideDuelWinner(scores) }
}

/**
 * 점수만 보고 승자를 정한다 (순수 함수 — 판정 규칙을 테스트로 고정하기 위해 분리).
 *
 * · 그 주 정산된 슬립이 0 인 주장은 "예측을 안 한 것"이라 후보에서 빠진다.
 *   상대가 냈다면 상대가 이긴다 — 안 하고 비기는 걸 막는다.
 * · 동점·양쪽 미참가는 **승자 없음**. 억지로 한쪽을 올리면 "왜 쟤가 이겼냐"가 되고,
 *   그 주 유니폼은 이월하지 않고 그냥 안 나간다(운영이 단순해야 분쟁이 없다).
 */
export function decideDuelWinner(scores: DuelScore[]): {
  winner: DuelScore | null
  reason?: string
} {
  const played = scores.filter((s) => s.settled_slips > 0)
  if (played.length === 0) {
    return { winner: null, reason: "양쪽 다 그 주 정산된 예측이 없음" }
  }

  const sorted = [...played].sort((a, b) => b.skill_score - a.skill_score)
  if (sorted.length > 1 && sorted[0].skill_score === sorted[1].skill_score) {
    return { winner: null, reason: "동점" }
  }

  return { winner: sorted[0] }
}

/** 이벤트 행 조회 (없거나 미오픈이면 null) */
export async function fetchOpenSeasonEvent(supabase: ServiceClient) {
  const { data } = await supabase
    .from("events")
    .select("id, status, start_at, end_at")
    .eq("slug", SEASON_EVENT_SLUG)
    .maybeSingle()
  return data ?? null
}
