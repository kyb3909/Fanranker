import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
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
 * Manual trigger for testing (development only)
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  return POST(request)
}
