import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { isUserSuspended } from "@/lib/check-suspension"
import { awardPoints, POINT_VALUES } from "@/lib/points"
import { awardFlairKarma } from "@/lib/metaverse/karma-award"
import { fetchVisibleComments } from "@/lib/comments/visible-comments"
import { recordFunnelMilestone } from "@/lib/analytics/funnel"
import { snapshotCommentStance } from "@/lib/saga/votes"
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
    // 비밀댓글 — 운영자만 실제 적용됨(아래 서버에서 role 검증). UI는 관리자에게만 노출.
    is_secret: z.boolean().optional().default(false),
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
    const postId = request.nextUrl.searchParams.get("post_id")

    if (!postId) {
      return NextResponse.json({ error: "post_id가 필요합니다." }, { status: 400 })
    }

    // 비밀댓글은 {원글 작성자, 운영자}에게만 포함 — 신원 확인 후 공유 헬퍼로 조회.
    const user = await currentUser()
    const { comments, profiles, equippedTitles } = await fetchVisibleComments(
      postId,
      user?.id ?? null
    )

    const res = NextResponse.json({ comments, profiles, equippedTitles })
    // 비밀댓글 때문에 유저별로 응답이 달라지므로 절대 공유 캐시 금지.
    res.headers.set("Cache-Control", "private, no-store")
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

    // 비밀댓글: 운영자만 실제 적용. 비관리자가 요청하면 조용히 일반댓글로 강등(방어).
    let isSecret = false
    if (result.data.is_secret) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle()
      isSecret = (prof as { role: string } | null)?.role === "admin"
    }

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
        is_secret: isSecret,
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

    // 포인트 적립 (비동기, 실패 무시) — 게시글의 community_slug + 팀 플레어 조회해서
    // 보드 포인트와 팀 카르마를 한 번의 lookup 으로 둘 다 적립.
    Promise.resolve(
      supabase
        .from("posts")
        .select("community_slug, flair_team_id, user_id")
        .eq("id", post_id)
        .single()
    )
      .then(({ data: postForPoints }) => {
        if (!postForPoints) return
        // 보드 포인트
        if (postForPoints.community_slug) {
          awardPoints(
            supabase,
            userId,
            postForPoints.community_slug,
            POINT_VALUES.comment,
            "comment",
            "댓글 작성",
            String(comment.id)
          ).catch((err: unknown) => console.error("Failed to award points for comment:", err))
        }
        // 팀 카르마 — 부모 글이 팀 플레어 달려있고, 자신의 글에 본인이 단 댓글이 아닐 때만
        if (postForPoints.flair_team_id && postForPoints.user_id !== userId) {
          awardFlairKarma(supabase, userId, postForPoints.flair_team_id, "comment").catch((err) =>
            console.error("Failed to award flair karma for comment:", err)
          )
        }
      })
      .catch((err: unknown) => console.error("Failed to lookup post for points/karma:", err))

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

    // 사가 스탠스 스냅샷 (비동기, 실패 무시) — 앵커 글이 아니면 내부에서 no-op
    snapshotCommentStance(supabase, post_id, String(comment.id), userId).catch((err: unknown) =>
      console.error("Failed to snapshot saga stance:", err)
    )

    // 온보딩 퍼널 4단계(게시판 첫 활동) — 댓글 쪽. 최초 여부는 DB 원장이 판정한다.
    const isFirstComment = await recordFunnelMilestone(userId, "first_comment")

    return NextResponse.json({ ...comment, is_first_comment: isFirstComment }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
