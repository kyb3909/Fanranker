import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

// POST: 이상형 월드컵 투표
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { session_id, round, match_index, candidate_a_id, candidate_b_id, winner_id } =
      await request.json()

    if (
      !session_id ||
      round == null ||
      match_index == null ||
      !candidate_a_id ||
      !candidate_b_id ||
      !winner_id
    ) {
      return apiBadRequest("모든 필드가 필요합니다")
    }

    const supabase = createServiceRoleClient()

    // 세션 소유자 확인
    const { data: session } = await supabase
      .from("worldcup_sessions")
      .select("user_id")
      .eq("id", session_id)
      .single()

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    // 투표 저장
    const { error } = await supabase.from("worldcup_votes").insert({
      session_id,
      round,
      match_index,
      candidate_a_id,
      candidate_b_id,
      winner_id,
    })

    if (error) return apiError("투표 실패", 500, error)

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("투표 실패", 500, error)
  }
}
