/**
 * 메인 사이트 활동(글/댓글/예측 적중 등) → 팀 카르마 + 활동 포인트 적립.
 *
 * metaverse_award_flair_karma RPC 호출 래퍼. fire-and-forget 패턴으로 사용 —
 * 실패해도 원 작업(글 작성 등)에 영향 주지 않음.
 *
 * 호출 지점:
 *  - POST /api/posts: 글에 flair_team_id 가 설정된 경우 (+10)
 *  - POST /api/comments: 부모 글에 flair_team_id 가 있는 경우 (+1)
 *  - lib/betman/settle.ts (Phase 2+): 팀 예측 적중 (+20) — TBD
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type FlairKarmaSource = "post" | "comment" | "prediction_hit" | "bonus"

const POINTS_BY_SOURCE: Record<FlairKarmaSource, number> = {
  post: 10,
  comment: 1,
  prediction_hit: 20,
  bonus: 5,
}

export async function awardFlairKarma(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
  source: FlairKarmaSource
): Promise<void> {
  const delta = POINTS_BY_SOURCE[source]
  if (!delta) return

  const { data, error } = await supabase.rpc("metaverse_award_flair_karma", {
    p_user_id: userId,
    p_team_id: teamId,
    p_delta: delta,
    p_source: source,
  })

  if (error) {
    console.error("[metaverse] award_flair_karma failed", {
      userId,
      teamId,
      source,
      message: error.message,
    })
    return
  }

  // 일일 cap 초과로 점수가 제한된 경우 진단용 로그 (정상 동작)
  const result = data as { capped?: boolean; delta?: number; today_total?: number } | null
  if (result?.capped) {
    console.info("[metaverse] flair karma capped", {
      userId,
      teamId,
      source,
      awarded: result.delta,
      todayTotal: result.today_total,
    })
  }
}
