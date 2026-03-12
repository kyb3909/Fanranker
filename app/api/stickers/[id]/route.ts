import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * POST /api/stickers/[id]
 * action=vote: 추천 투표
 * action=purchase: 스티커 구매
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id } = await params
    const body = await request.json()
    const action = body.action as string

    const supabase = createServiceRoleClient()

    if (action === "vote") {
      const { data, error } = await supabase.rpc("vote_sticker", {
        p_sticker_id: id,
        p_user_id: user.id,
      })
      if (error) return apiError("투표 실패", 500, error)
      return NextResponse.json(data)
    }

    if (action === "purchase") {
      const boardSlug = body.board_slug || "free-board"
      const { data, error } = await supabase.rpc("purchase_sticker", {
        p_user_id: user.id,
        p_sticker_id: id,
        p_board_slug: boardSlug,
      })
      if (error) return apiError("구매 실패", 500, error)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
