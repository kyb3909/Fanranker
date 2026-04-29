import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"
import { z } from "zod"

const VoteSchema = z
  .object({
    session_id: z.string().uuid(),
    round: z.number().int().nonnegative(),
    match_index: z.number().int().nonnegative(),
    candidate_a_id: z.string().min(1),
    candidate_b_id: z.string().min(1),
    winner_id: z.string().min(1),
  })
  .refine((v) => v.winner_id === v.candidate_a_id || v.winner_id === v.candidate_b_id, {
    message: "winner_id는 candidate_a_id 또는 candidate_b_id 중 하나여야 합니다.",
    path: ["winner_id"],
  })

// POST: 이상형 월드컵 투표
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = VoteSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("모든 필드가 필요합니다")
    const { session_id, round, match_index, candidate_a_id, candidate_b_id, winner_id } =
      parsed.data

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
