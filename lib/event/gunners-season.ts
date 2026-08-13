import type { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 건너스 레이스 — 아스날 팬 시즌 이벤트 (2026-08-22 ~ 09-30, 1차 구간).
 *
 * ## 설계 (workspace/event-gunners-season-plan-20260814.md)
 * - **별도 예측 풀이 없다.** 기간 내 축구(sport='축구') 슬립을 그대로 집계한다 —
 *   월드컵의 event_id 분리 방식보다 단순하고, 유저는 평소처럼 /prediction 에서 픽하면
 *   자동으로 레이스에 올라탄다 (참가 마찰 0).
 * - 점수 = 슬립 단위 net 손익 (월드컵 검증 모델: won = stake×(total_odds−1), lost = −stake).
 *   points_earned(배당 합계) 함정을 피한 그 산식 그대로.
 * - 아스날 보너스 없음 (운영자 확정 2026-08-14) — 아스날 경기는 UI 강조만.
 * - 랭킹 TOP 5 + 내 순위 공개 (월드컵의 비공개 정책 해제 — 운영자 확정).
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export const GUNNERS_SEASON = {
  slug: "gunners-season",
  title: "건너스 레이스",
  // KST 8/22 00:00 ~ 10/1 00:00
  startAt: "2026-08-21T15:00:00.000Z",
  endAt: "2026-09-30T15:00:00.000Z",
} as const

export function isEventLive(now = new Date()): boolean {
  return now >= new Date(GUNNERS_SEASON.startAt) && now < new Date(GUNNERS_SEASON.endAt)
}

export interface RaceRow {
  userId: string
  nickname: string
  points: number
  slips: number
  won: number
}

export interface RaceStanding {
  top: RaceRow[]
  me: (RaceRow & { rank: number }) | null
  participants: number
}

/**
 * 기간 내 축구 슬립 → 유저별 net 손익 랭킹.
 * pending/refunded 는 점수 제외 (정산 완료분만) — 슬립 수에는 pending 포함해
 * "참여 중" 감각은 살린다.
 */
export async function computeRaceStanding(
  supabase: ServiceClient,
  meUserId: string | null,
  topN = 5
): Promise<RaceStanding> {
  const { data: slips } = await supabase
    .from("prediction_slips")
    .select("user_id, stake, total_odds, status")
    .eq("sport", "축구")
    .gte("created_at", GUNNERS_SEASON.startAt)
    .lt("created_at", GUNNERS_SEASON.endAt)
    .limit(20000)

  const byUser = new Map<string, { points: number; slips: number; won: number }>()
  for (const s of slips ?? []) {
    const row = byUser.get(s.user_id) ?? { points: 0, slips: 0, won: 0 }
    row.slips += 1
    const stake = Number(s.stake) || 0
    if (s.status === "won") {
      row.points += stake * ((Number(s.total_odds) || 1) - 1)
      row.won += 1
    } else if (s.status === "lost") {
      row.points -= stake
    }
    byUser.set(s.user_id, row)
  }

  const ranked = [...byUser.entries()]
    .map(([userId, r]) => ({ userId, ...r }))
    .sort((a, b) => b.points - a.points || b.won - a.won)

  const topIds = ranked.slice(0, topN).map((r) => r.userId)
  const meIdx = meUserId ? ranked.findIndex((r) => r.userId === meUserId) : -1
  const needIds = [...new Set([...topIds, ...(meIdx >= 0 ? [meUserId as string] : [])])]

  const { data: profiles } = needIds.length
    ? await supabase.from("profiles").select("user_id, nickname").in("user_id", needIds)
    : { data: [] }
  const nick = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname as string]))

  const toRow = (r: (typeof ranked)[number]): RaceRow => ({
    userId: r.userId,
    nickname: nick.get(r.userId) ?? "익명",
    points: Math.round(r.points),
    slips: r.slips,
    won: r.won,
  })

  return {
    top: ranked.slice(0, topN).map(toRow),
    me: meIdx >= 0 ? { ...toRow(ranked[meIdx]), rank: meIdx + 1 } : null,
    participants: ranked.length,
  }
}

/** 아스날 표기 흔들림 (betman 실측: 아스널) — 메인 매치 탐색용 */
const ARSENAL_RE = /아스널|아스날/

/** 다가오는 아스날 경기 1건 (전 대회 — league_code 무관). 없으면 null */
export async function findArsenalNextMatch(supabase: ServiceClient): Promise<{
  home: string
  away: string
  matchTime: string
  league: string | null
} | null> {
  const { data } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, match_time, league_code")
    .eq("sport", "축구")
    .eq("status", "scheduled")
    .gt("match_time", new Date().toISOString())
    .order("match_time", { ascending: true })
    .limit(400)
  const g = (data ?? []).find(
    (row) => ARSENAL_RE.test(row.home_team_name ?? "") || ARSENAL_RE.test(row.away_team_name ?? "")
  )
  return g
    ? {
        home: g.home_team_name,
        away: g.away_team_name,
        matchTime: g.match_time,
        league: g.league_code,
      }
    : null
}
