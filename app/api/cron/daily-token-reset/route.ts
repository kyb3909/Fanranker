import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"

/**
 * POST /api/cron/daily-token-reset
 *
 * Daily token reset cron job — runs at 23:00 KST (14:00 UTC)
 * Calls ensure_daily_token_reset RPC for each user; the DB function
 * (get_token_reset_date) handles the 23:00 KST boundary logic.
 */

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // Get all user_ids that have token records
    const { data: users, error: fetchError } = await supabase.from("user_tokens").select("user_id")

    if (fetchError) {
      return apiError("사용자 목록을 가져오지 못했습니다.", 500, fetchError)
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users found",
        resetCount: 0,
      })
    }

    // 배치 처리: 50명씩 병렬 실행 (Vercel timeout 방지)
    const BATCH_SIZE = 50
    let resetCount = 0
    let errorCount = 0

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((user) =>
          supabase.rpc("reset_user_daily_tokens", {
            target_user_id: user.user_id,
          })
        )
      )

      for (const result of results) {
        if (result.status === "fulfilled" && !result.value.error) {
          resetCount++
        } else {
          errorCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Token reset completed`,
      resetCount,
      errorCount,
      totalUsers: users.length,
    })
  } catch (error) {
    return apiError("Internal server error", 500, error)
  }
}

/**
 * GET /api/cron/daily-token-reset
 *
 * Vercel Cron 은 등록된 path 로 GET 요청을 보낸다 (메서드 지정 불가).
 * 실제 로직은 POST 에 있으므로 GET 은 POST 로 위임한다.
 * POST 내부의 verifyCronSecret 이 CRON_SECRET 을 검증하므로 무단 호출은 차단된다.
 */
export const GET = withCronLog("daily-token-reset", (request: NextRequest) => POST(request))
