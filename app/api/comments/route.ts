import { NextRequest, NextResponse } from "next/server"
import { createAnonClient, createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { isUserSuspended } from "@/lib/check-suspension"
import { awardPoints, POINT_VALUES } from "@/lib/points"
import { z } from "zod"

const CommentCreateSchema = z
  .object({
    post_id: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().uuid("유효하지 않은 게시글 ID입니다.")),
    content: z.string().max(5000, "댓글은 5000자 이하여야 합니다.").optional().default(""),
    parent_id: z.union([z.string(), z.number()]).transform(String).optional(),
    sticker_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.content.trim().length > 0 || data.sticker_id, {
    message: "댓글 내용 또는 스티커를 선택해주세요.",
  })

/**
 * GET /api/comments?post_id=<uuid>
 * 댓글 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
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
        updated_at,
        sticker_id,
        stickers ( id, name, image_url, media_type )
      `
      )
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200)

    if (error) {
      return apiError("댓글을 불러오는 중 오류가 발생했습니다.", 500, error)
    }

    if (!comments || comments.length === 0) {
      return NextResponse.json({ comments: [], profiles: [] })
    }

    // 작성자 프로필 + 장착 칭호 조회
    const userIds = [...new Set(comments.map((c) => c.user_id))]
    const [{ data: profiles }, { data: equippedTitles }] = await Promise.all([
      supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
      supabase
        .from("user_equipped_titles")
        .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
        .in("user_id", userIds),
    ])

    const res = NextResponse.json({ comments, profiles, equippedTitles: equippedTitles || [] })
    res.headers.set("Cache-Control", "private, max-age=0, must-revalidate")
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
    if (await isUserSuspended(userId)) {
      return NextResponse.json({ error: "활동이 정지된 계정입니다." }, { status: 403 })
    }

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const result = CommentCreateSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { post_id, parent_id, content, sticker_id } = result.data

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
        content: content.trim() || (sticker_id ? "" : ""),
        vote_count: 0,
        sticker_id: sticker_id || null,
      })
      .select()
      .single()

    if (insertError) {
      return apiError("댓글 저장 중 오류가 발생했습니다.", 500, insertError)
    }

    // 스티커 사용 카운트 증가 (비동기)
    if (sticker_id) {
      supabase.rpc("increment_sticker_use", { p_sticker_id: sticker_id }).then(
        () => {
          /* done */
        },
        () => {
          /* ignore */
        }
      )
    }

    // 포인트 적립 (비동기, 실패 무시) — 게시글의 community_slug를 조회해서 적립
    Promise.resolve(supabase.from("posts").select("community_slug").eq("id", post_id).single())
      .then(({ data: postForPoints }) => {
        if (postForPoints?.community_slug) {
          return awardPoints(
            supabase,
            userId,
            postForPoints.community_slug,
            POINT_VALUES.comment,
            "comment",
            "댓글 작성",
            String(comment.id)
          )
        }
      })
      .catch((err: unknown) => console.error("Failed to award points for comment:", err))

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
