import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

/**
 * POST /api/comments/[id]/vote
 * 댓글 투표 (추천/비추천) - Toggle 방식
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { id: commentId } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 })
    }
    const VoteSchema = z.object({ type: z.enum(["up", "down"]).default("up") })
    const parsed = VoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'type은 "up" 또는 "down"이어야 합니다.' }, { status: 400 })
    }
    const voteType = parsed.data.type

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // 기존 투표 확인
    const { data: existing, error: checkError } = await supabase
      .from("comment_votes")
      .select("id, vote_type")
      .eq("comment_id", commentId)
      .eq("user_id", user.id)
      .single()

    let action: "created" | "updated" | "deleted" = "created"
    let newVoteType: string | null = voteType

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Failed to check existing vote:", checkError)
    }

    if (existing) {
      if (existing.vote_type === voteType) {
        // 같은 타입 재클릭 → 취소
        await supabase.from("comment_votes").delete().eq("id", existing.id)
        action = "deleted"
        newVoteType = null
      } else {
        // 다른 타입으로 변경
        await supabase.from("comment_votes").update({ vote_type: voteType }).eq("id", existing.id)
        action = "updated"
      }
    } else {
      // 새 투표
      const { error: insertError } = await supabase
        .from("comment_votes")
        .insert({ comment_id: commentId, user_id: user.id, vote_type: voteType })

      if (insertError) {
        return apiError("투표 저장 중 오류가 발생했습니다.", 500, insertError)
      }
    }

    // vote_count는 DB trigger(trg_comment_vote_count)가 자동 갱신
    // 갱신된 vote_count 조회 + 댓글 작성자 ID 확인
    const { data: commentData } = await supabase
      .from("comments")
      .select("vote_count, user_id")
      .eq("id", commentId)
      .single()

    // 댓글 작성자 + 투표한 사람의 유저 온도 갱신
    if (commentData?.user_id) {
      Promise.resolve(
        supabase.rpc("update_user_temperature", { p_user_id: commentData.user_id })
      ).catch((e: unknown) => {
        console.error("Failed to update comment author temperature:", e)
      })
    }
    Promise.resolve(supabase.rpc("update_user_temperature", { p_user_id: user.id })).catch(
      (e: unknown) => {
        console.error("Failed to update voter temperature:", e)
      }
    )

    return NextResponse.json({
      success: true,
      action,
      voteType: newVoteType,
      voteCount: commentData?.vote_count ?? 0,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
