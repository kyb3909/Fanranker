import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

// POST: 이상형 월드컵 완료 (우승자 결정)
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { session_id, winner_id } = await request.json()
    if (!session_id || !winner_id) return apiBadRequest("session_id와 winner_id는 필수입니다")

    const supabase = createServiceRoleClient()

    // 세션 소유자 확인
    const { data: session } = await supabase
      .from("worldcup_sessions")
      .select("user_id, completed_at")
      .eq("id", session_id)
      .single()

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    if (session.completed_at) {
      return NextResponse.json({ error: "이미 완료된 세션입니다" }, { status: 400 })
    }

    // 세션 완료 처리
    await supabase
      .from("worldcup_sessions")
      .update({ winner_id, completed_at: new Date().toISOString() })
      .eq("id", session_id)

    // 우승 횟수 증가
    await supabase.rpc("increment_worldcup_win", { p_candidate_id: winner_id })

    // MBTI 우승 통계 + 참여자 기록 (비동기)
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("mbti")
        .eq("user_id", user.id)
        .single()

      if (profile?.mbti) {
        const { data: sess } = await supabase
          .from("worldcup_sessions")
          .select("battle_id")
          .eq("id", session_id)
          .single()

        if (sess?.battle_id) {
          // 우승자에 대한 MBTI 우승 기록
          await supabase.rpc("record_mbti_vote", {
            p_battle_id: sess.battle_id,
            p_candidate_id: winner_id,
            p_mbti: profile.mbti,
            p_is_winner: true,
          })

          // MBTI 참여자 수 기록
          await supabase.rpc("record_mbti_participant", {
            p_battle_id: sess.battle_id,
            p_mbti: profile.mbti,
          })
        }
      }
    } catch {
      // MBTI 통계 실패는 무시
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("월드컵 완료 처리 실패", 500, error)
  }
}
