import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const CommentCreateSchema = z.object({
  post_id: z.string().min(1, "게시글 ID가 필요합니다."),
  content: z.string().min(1, "댓글 내용을 입력해주세요."),
  parent_id: z.string().optional(),
})

/**
 * GET /api/comments?post_id=<uuid>
 * 댓글 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { createAnonClient } = await import("@/lib/supabase/server")
    const supabase = createAnonClient()
    const searchParams = request.nextUrl.searchParams
    const postId = searchParams.get("post_id")

    if (!postId) {
      return NextResponse.json({ error: "post_id가 필요합니다." }, { status: 400 })
    }

    // 모든 댓글 조회 (부모 댓글과 대댓글 모두)
    const { data: comments, error } = await supabase
      .from("comments")
      .select(
        `
        id,
        post_id,
        user_id,
        parent_id,
        content,
        vote_count,
        created_at,
        updated_at
      `
      )
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })

    if (error) {
      return apiError("댓글을 불러오는 중 오류가 발생했습니다.", 500, error)
    }

    if (!comments || comments.length === 0) {
      return NextResponse.json({ comments: [], profiles: [] })
    }

    // 작성자 프로필 조회
    const userIds = [...new Set(comments.map((c) => c.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", userIds)

    const res = NextResponse.json({ comments, profiles })
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * POST /api/comments
 * 댓글 작성
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    // currentUser()를 사용하여 인증 확인 (API 라우트에서 더 안정적)
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // 정지 유저 차단
    const { isUserSuspended } = await import("@/lib/check-suspension")
    if (await isUserSuspended(userId)) {
      return NextResponse.json({ error: "활동이 정지된 계정입니다." }, { status: 403 })
    }

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const result = CommentCreateSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { post_id, parent_id, content } = result.data

    // 쿨다운 체크 (10초 간격)
    const { data: canPost, error: cooldownError } = await supabase.rpc("can_post_comment", {
      user_id_param: userId,
    })

    if (cooldownError) {
      console.error("Failed to check comment cooldown:", cooldownError)
      // 쿨다운 체크 실패는 무시하고 계속 진행 (에러 처리 개선)
    } else if (canPost === false) {
      return NextResponse.json(
        {
          error: "댓글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요.",
          code: "COOLDOWN_ACTIVE",
        },
        { status: 429 } // Too Many Requests
      )
    }

    // 댓글 저장
    const { data: comment, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id,
        user_id: userId,
        parent_id: parent_id || null,
        content: content.trim(),
        vote_count: 0,
      })
      .select()
      .single()

    if (insertError) {
      return apiError("댓글 저장 중 오류가 발생했습니다.", 500, insertError)
    }

    // 알림 생성 (비동기로 처리, 실패해도 무시)
    Promise.resolve(supabase.from("posts").select("user_id").eq("id", post_id).single())
      .then(({ data: postData }) => {
        if (!postData) return

        let notificationUserId = postData.user_id

        // 대댓글인 경우 (parent_id가 있으면) 원댓글 작성자에게 알림
        if (parent_id) {
          return supabase
            .from("comments")
            .select("user_id")
            .eq("id", parent_id)
            .single()
            .then(({ data: parentComment }) => {
              if (parentComment && parentComment.user_id !== userId) {
                notificationUserId = parentComment.user_id
              }
              return notificationUserId
            })
        }
        return notificationUserId
      })
      .then((notificationUserId) => {
        if (!notificationUserId || notificationUserId === userId) {
          // 자신에게는 알림 생성하지 않음
          return
        }

        // 알림 생성
        return supabase.from("notifications").insert({
          user_id: notificationUserId,
          type: parent_id ? "reply" : "comment",
          actor_id: userId,
          related_post_id: post_id,
          related_comment_id: comment.id,
          is_read: false,
        })
      })
      .catch((err: unknown) => {
        console.error("Failed to create notification:", err)
      })

    // Note: comment_count is now automatically incremented by database trigger
    // No manual increment needed - trigger handles it atomically

    // 댓글 작성 성공 후 쿨다운 업데이트
    Promise.resolve(supabase.rpc("update_comment_cooldown", { user_id_param: userId })).catch(
      (err: unknown) => {
        console.error("Failed to update comment cooldown:", err)
        // 쿨다운 업데이트 실패는 무시 (댓글 작성은 성공)
      }
    )

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
