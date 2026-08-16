import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 온보딩 퍼널 단계 기록 (서버 전용)
 *
 * "이번이 처음이었나"를 돌려주므로 호출부는 GA4 이벤트를 최초 1회만 쏠 수 있다.
 * 클라이언트의 first_* 이벤트는 매번 발사되는 문제가 있었다 — 진짜 최초 판정은
 * DB 만 할 수 있어서 여기로 옮겼다.
 *
 * ⚠️ 절대 throw 하지 않는다. 계측 실패가 예측/댓글 자체를 죽이면 본말전도다.
 */
type FunnelStep = "first_slip" | "first_post" | "first_comment"

export async function recordFunnelMilestone(userId: string, step: FunnelStep): Promise<boolean> {
  if (!userId) return false
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc("record_funnel_milestone", {
      p_user_id: userId,
      p_step: step,
    })
    if (error) {
      console.error("[funnel] milestone 기록 실패:", step, error.message)
      return false
    }
    return data === true
  } catch (e) {
    console.error("[funnel] milestone 기록 예외:", step, e)
    return false
  }
}
