import "server-only"

import { createHash, randomInt } from "node:crypto"
import type { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchAllSeasonPoints, SEASON_EVENT_SLUG } from "@/lib/event/season-stats"

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
}

export interface DrawWinner {
  user_id: string
  nickname: string
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

  return qualified
    .map((q) => ({
      user_id: q.userId,
      nickname: nickById.get(q.userId) ?? "이름 없는 팬",
      total_points: q.totalPoints,
      community_actions: q.communityActions,
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
  return pool.slice(0, take).map((c) => ({ user_id: c.user_id, nickname: c.nickname }))
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
