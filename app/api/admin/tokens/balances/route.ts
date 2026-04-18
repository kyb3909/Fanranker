import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/admin/tokens/balances
 *
 * Get token balances for all users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data: tokens, error } = await supabase
      .from("user_tokens")
      .select(
        `
        user_id,
        token_balance,
        last_reset_at,
        total_tokens_earned,
        profiles (
          nickname,
          avatar_url
        )
      `
      )
      .order("token_balance", { ascending: false })

    if (error) {
      return apiError("토큰 목록을 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({ tokens: tokens || [] })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
