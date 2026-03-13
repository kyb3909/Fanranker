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

    // MBTI 통계 기록 (비동기, 실패해도 투표는 성공)
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("mbti")
        .eq("user_id", user.id)
        .single()

      if (profile?.mbti) {
        // 세션에서 battle_id 가져오기
        const { data: sess } = await supabase
          .from("worldcup_sessions")
          .select("battle_id")
          .eq("id", session_id)
          .single()

        if (sess?.battle_id) {
          // 선택된 후보에 대한 MBTI 투표 기록
          await supabase.rpc("record_mbti_vote", {
            p_battle_id: sess.battle_id,
            p_candidate_id: winner_id,
            p_mbti: profile.mbti,
            p_is_winner: false,
          })
        }
      }
    } catch {
      // MBTI 통계 실패는 무시
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("투표 실패", 500, error)
  }
}
