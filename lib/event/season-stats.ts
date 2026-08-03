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

/**
 * 성적 집계. `range` 를 주면 그 구간만, 안 주면 이벤트 전 기간(누적).
 *
 * 구간 집계가 필요한 이유: 크리에이터 주간 맞대결은 **그 주 성적**으로 가린다.
 * 누적으로 판정하면 1주차 승자가 계속 이겨서 2~4주차 긴장이 죽는다.
 */
export async function computeSeasonStandings(
  supabase: ServiceClient,
  range?: { from: Date; to: Date }
): Promise<SeasonStandings> {
  const { data, error } = await supabase.rpc("season_event_slips_range", {
    p_event_slug: SEASON_EVENT_SLUG,
    p_from: range?.from.toISOString() ?? null,
    p_to: range?.to.toISOString() ?? null,
  })
  if (error) throw new Error(`season_event_slips_range RPC 실패: ${error.message}`)

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

/* ── 활동 포인트 (경품 응모 자격) ─────────────────────────────── */

/** 응모 기준점 — 설계 문서 미정 항목의 기본값 (운영 확정 시 이 상수만 변경) */
export const POINTS_THRESHOLD = 30
/** 응모 조건: 커뮤니티 활동(글+댓글) 최소 횟수 — 예측만으로는 응모 불가 (설계 §1) */
export const MIN_COMMUNITY_ACTIONS = 3

export interface SeasonPoints {
  userId: string
  totalPoints: number
  predictionPoints: number
  postPoints: number
  commentPoints: number
  votePoints: number
  communityActions: number
  /** 응모 자격 충족 여부 */
  qualified: boolean
}

function mapPointsRow(r: {
  user_id: string
  total_points: number
  prediction_points: number
  post_points: number
  comment_points: number
  vote_points: number
  community_actions: number
}): SeasonPoints {
  return {
    userId: r.user_id,
    totalPoints: r.total_points,
    predictionPoints: r.prediction_points,
    postPoints: r.post_points,
    commentPoints: r.comment_points,
    votePoints: r.vote_points,
    communityActions: r.community_actions,
    qualified: r.total_points >= POINTS_THRESHOLD && r.community_actions >= MIN_COMMUNITY_ACTIONS,
  }
}

/** 단일 유저 포인트 (미등록이면 null) — /season 진행바·마이페이지용 */
export async function fetchSeasonPointsForUser(
  supabase: ServiceClient,
  userId: string
): Promise<SeasonPoints | null> {
  const { data, error } = await supabase.rpc("season_event_points", {
    p_event_slug: SEASON_EVENT_SLUG,
    p_user_id: userId,
  })
  if (error || !data || (data as unknown[]).length === 0) return null
  return mapPointsRow((data as Parameters<typeof mapPointsRow>[0][])[0])
}

/** 전체 등록자 포인트 — 추첨 자격자 집계·검수용 */
export async function fetchAllSeasonPoints(supabase: ServiceClient): Promise<SeasonPoints[]> {
  const { data, error } = await supabase.rpc("season_event_points", {
    p_event_slug: SEASON_EVENT_SLUG,
  })
  if (error) throw new Error(`season_event_points RPC 실패: ${error.message}`)
  return ((data ?? []) as Parameters<typeof mapPointsRow>[0][]).map(mapPointsRow)
}
