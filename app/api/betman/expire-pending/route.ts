import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"

/**
 * POST /api/betman/expire-pending
 *
 * 48시간 이상 경과한 pending 예측/슬립을 자동 만료 처리.
 * Vultr cron에서 주기적으로 호출.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc("expire_stale_pending_predictions")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      result: data,
      message: "만료 처리 완료",
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
