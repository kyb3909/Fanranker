import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient, createAnonClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { awardPoints, POINT_VALUES } from "@/lib/points"
import { z } from "zod"

/**
 * POST /api/posts/[id]/vote
 * 투표 (추천/비추천) - Toggle 방식
 *
 * Body:
 * - type: 'up' | 'down' (선택, 기본값: 'up')
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    // currentUser()를 사용하여 인증 확인 (API 라우트에서 더 안정적)
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    const { id: postId } = await params
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

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    // currentUser()로 이미 user_id를 검증했으므로 안전합니다.
    // ⚠️ 중요: Service Role은 RLS를 우회하므로, 반드시 코드에서 user_id를 검증해야 합니다!
    const supabase = createServiceRoleClient()

    // 1. 기존 투표 확인
    const { data: existingVote, error: checkError } = await supabase
      .from("post_votes")
      .select("id, vote_type")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .single()

    let voteAction: "created" | "updated" | "deleted" = "created"
    let newVoteType: string | null = voteType

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Failed to check existing vote:", checkError)
    }

    // 2. 투표 처리
    if (existingVote) {
      // 이미 투표한 경우
      if (existingVote.vote_type === voteType) {
        // 같은 타입의 투표를 다시 클릭하면 취소 (삭제)
        const { error: deleteError } = await supabase
          .from("post_votes")
          .delete()
          .eq("id", existingVote.id)

        if (deleteError) {
          return apiError("투표 취소 중 오류가 발생했습니다.", 500, deleteError)
        }

        voteAction = "deleted"
        newVoteType = null
      } else {
        // 다른 타입의 투표로 변경
        const { error: updateError } = await supabase
          .from("post_votes")
          .update({ vote_type: voteType })
          .eq("id", existingVote.id)

        if (updateError) {
          return apiError("투표 변경 중 오류가 발생했습니다.", 500, updateError)
        }

        voteAction = "updated"
      }
    } else {
      // 새로운 투표 생성
      const { error: insertError } = await supabase.from("post_votes").insert({
        post_id: postId,
        user_id: userId,
        vote_type: voteType,
      })

      if (insertError) {
        return apiError("투표 저장 중 오류가 발생했습니다.", 500, insertError)
      }
    }

    // vote_count는 DB trigger(trg_post_vote_count)가 자동 갱신
    // 갱신된 vote_count 조회 + 게시물 작성자 ID + 게시판 slug
    const { data: postData } = await supabase
      .from("posts")
      .select("vote_count, user_id, community_slug")
      .eq("id", postId)
      .single()

    // 게시물 작성자 + 투표자 온도 비동기 갱신
    if (postData?.user_id) {
      Promise.resolve(
        supabase.rpc("update_user_temperature", { p_user_id: postData.user_id })
      ).catch((e: unknown) => {
        console.error("Failed to update post author temperature:", e)
      })

      // 추천(up) 시 작성자에게 포인트 적립 (자추 방지, 새 투표일 때만)
      if (
        voteType === "up" &&
        voteAction === "created" &&
        postData.user_id !== userId &&
        postData.community_slug
      ) {
        awardPoints(
          supabase,
          postData.user_id,
          postData.community_slug,
          POINT_VALUES.vote_received,
          "vote_received",
          "게시글 추천 받음",
          postId
        ).catch(console.error)
      }
    }
    Promise.resolve(supabase.rpc("update_user_temperature", { p_user_id: userId })).catch(
      (e: unknown) => {
        console.error("Failed to update voter temperature:", e)
      }
    )

    return NextResponse.json({
      success: true,
      action: voteAction,
      voteType: newVoteType,
      voteCount: postData?.vote_count ?? 0,
      message: voteAction === "deleted" ? "투표가 취소되었습니다." : "투표가 저장되었습니다.",
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/posts/[id]/vote
 * 사용자의 투표 상태 조회
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // currentUser()를 사용하여 인증 확인
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ voted: false, voteType: null })
    }

    const userId = user.id

    const { id: postId } = await params
    const supabase = createAnonClient()

    const { data: vote } = await supabase
      .from("post_votes")
      .select("vote_type")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .single()

    return NextResponse.json({
      voted: !!vote,
      voteType: vote?.vote_type || null,
    })
  } catch (error) {
    // 에러 발생 시 투표하지 않은 것으로 간주
    return NextResponse.json({ voted: false, voteType: null })
  }
}
