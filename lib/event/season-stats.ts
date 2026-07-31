import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import {
  computeUserScores,
  computeGroupScores,
  type UserEventScore,
  type GroupEventScore,
} from "@/lib/event/scoring"

/**
 * 시즌 오픈 이벤트 성적 집계 — 동적 슬립 귀속 (2026-07-31 Phase 2).
 *
 * 슬립에 event_id 를 쓰지 않는다. season_event_slips RPC 가 "등록자의 이벤트 기간 내
 * EPL(only) 정산 슬립"을 조인으로 골라오고, 예측력 산식(lib/event/scoring)으로 채점한다.
 * 유저 마찰 0(평소처럼 예측), 규칙 변경 시 소급 재계산 가능.
 */

export const SEASON_EVENT_SLUG = "season-open-2026"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export interface SeasonStandings {
  users: UserEventScore[]
  groups: GroupEventScore[]
  /** user_id → group slug (스냅샷 저장 시 그룹 매핑에 사용) */
  userGroup: Map<string, string>
}

export async function computeSeasonStandings(supabase: ServiceClient): Promise<SeasonStandings> {
  const { data, error } = await supabase.rpc("season_event_slips", {
    p_event_slug: SEASON_EVENT_SLUG,
  })
  if (error) throw new Error(`season_event_slips RPC 실패: ${error.message}`)

  const rows = (data ?? []) as {
    user_id: string
    status: string
    stake: number | null
    total_odds: number | string | null
    group_slug: string
  }[]

  const userGroup = new Map<string, string>()
  for (const r of rows) userGroup.set(r.user_id, r.group_slug)

  const users = computeUserScores(rows)
  const groups = computeGroupScores(users, userGroup)
  return { users, groups, userGroup }
}

/** 실시간 노출용 누적 이벤트 예측 수 (pending 포함) — 실패 시 0 */
export async function fetchSeasonSlipCount(supabase: ServiceClient): Promise<number> {
  const { data, error } = await supabase.rpc("season_event_slip_count", {
    p_event_slug: SEASON_EVENT_SLUG,
  })
  if (error) return 0
  return (data as number) ?? 0
}
