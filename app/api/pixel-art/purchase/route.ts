import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const PurchaseSchema = z.object({
  pixel_art_id: z.string().uuid("유효하지 않은 아이템 ID입니다."),
  board_slug: z.string().min(1, "게시판을 선택해주세요."),
})

/**
 * POST /api/pixel-art/purchase
 *
 * 픽셀아트 구매 (해당 게시판의 available_points 차감)
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

    const { pixel_art_id, board_slug } = result.data
    const supabase = createServiceRoleClient()
    const userId = user.id

    // 아이템 정보 조회
    const { data: item, error: itemError } = await supabase
      .from("pixel_art_items")
      .select("*")
      .eq("id", pixel_art_id)
      .eq("is_active", true)
      .single()

    if (itemError || !item) {
      return apiBadRequest("존재하지 않거나 판매 중이 아닌 아이템입니다.")
    }

    // 특정 게시판 전용 아이템 체크
    if (item.board_slug && item.board_slug !== board_slug) {
      return apiBadRequest(`이 아이템은 ${item.board_slug} 게시판 포인트로만 구매할 수 있습니다.`)
    }

    // 이미 보유 여부
    const { data: owned } = await supabase
      .from("user_pixel_arts")
      .select("id")
      .eq("user_id", userId)
      .eq("pixel_art_id", pixel_art_id)
      .single()

    if (owned) {
      return apiBadRequest("이미 보유한 아이템입니다.")
    }

    // 원자적 포인트 차감 (TOCTOU 경쟁 상태 방지)
    const { data: updated, error: deductError } = await supabase.rpc("deduct_board_points", {
      p_user_id: userId,
      p_board_slug: board_slug,
      p_amount: item.price,
    })

    if (deductError || !updated?.success) {
      const currentPoints = updated?.current_points ?? 0
      return NextResponse.json(
        {
          error: "포인트가 부족합니다.",
          required: item.price,
          current: currentPoints,
        },
        { status: 400 }
      )
    }

    // 트랜잭션 기록
    await supabase.from("point_transactions").insert({
      user_id: userId,
      board_slug,
      amount: -item.price,
      transaction_type: "shop_purchase",
      description: `픽셀아트 구매: ${item.name}`,
      related_id: pixel_art_id,
    })

    // 구매 기록
    await supabase.from("user_pixel_arts").insert({
      user_id: userId,
      pixel_art_id,
    })

    return NextResponse.json({ success: true, item_name: item.name, spent: item.price })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
