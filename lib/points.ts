/**
 * 포인트 시스템 서버 헬퍼
 * award_points RPC를 호출하여 게시판별 포인트를 적립/차감
 */

import { type SupabaseClient } from "@supabase/supabase-js"

/** 포인트 적립/차감 결과 */
interface AwardResult {
  success: boolean
  amount?: number
  total_points?: number
  available_points?: number
  reason?: string
}

/** 포인트 적립 액션 타입과 기본 포인트 */
export const POINT_VALUES = {
  post: 10,
  comment: 3,
  vote_received: 2,
  prediction_join: 5,
  prediction_hit: 15,
} as const

/**
 * 포인트 적립/차감 (fire-and-forget 패턴으로 사용)
 *
 * @example
 * // 글 작성 시 (비동기로 호출, 실패 무시)
 * awardPoints(supabase, userId, communitySlug, POINT_VALUES.post, 'post', '글 작성', postId)
 *   .catch(console.error)
 */
export async function awardPoints(
  supabase: SupabaseClient,
  userId: string,
  boardSlug: string,
  amount: number,
  type: string,
  description?: string,
  relatedId?: string
): Promise<AwardResult> {
  const { data, error } = await supabase.rpc("award_points", {
    p_user_id: userId,
    p_board_slug: boardSlug,
    p_amount: amount,
    p_type: type,
    p_description: description || null,
    p_related_id: relatedId || null,
  })

  if (error) {
    console.error("[Points] award_points RPC error:", error)
    return { success: false, reason: error.message }
  }

  return data as AwardResult
}
