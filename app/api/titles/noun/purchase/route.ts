import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const PurchaseSchema = z.object({
  noun_title_id: z.string().uuid("유효하지 않은 칭호 ID입니다."),
})

/**
 * POST /api/titles/noun/purchase
 *
 * 명사 칭호 구매 (available_points 차감)
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const result = PurchaseSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc("purchase_noun_title", {
      p_user_id: user.id,
      p_noun_title_id: result.data.noun_title_id,
    })

    if (error) {
      return apiError("구매 처리 중 오류가 발생했습니다.", 500, error)
    }

    const rpcResult = data as { success: boolean; reason?: string; title?: string; spent?: number }

    if (!rpcResult.success) {
      const messages: Record<string, string> = {
        title_not_found: "존재하지 않는 칭호입니다.",
        already_owned: "이미 보유한 칭호입니다.",
        level_too_low: "레벨이 부족합니다.",
        insufficient_points: "포인트가 부족합니다.",
      }
      return NextResponse.json(
        { error: messages[rpcResult.reason || ""] || "구매에 실패했습니다.", detail: rpcResult },
        { status: 400 }
      )
    }

    return NextResponse.json(rpcResult, { status: 200 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
