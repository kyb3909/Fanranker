import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { z } from "zod"

/**
 * GET /api/notifications
 * 알림 목록 조회
 *
 * Query Parameters:
 * - limit?: 결과 개수 (기본값: 20)
 * - unread_only?: 읽지 않은 알림만 (기본값: false)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      return apiError("서버 설정 오류가 발생했습니다.", 500, error)
    }
    const searchParams = request.nextUrl.searchParams

    // count_only=true: 읽지 않은 알림 개수만 반환 (뱃지용)
    const countOnly = searchParams.get("count_only") === "true"
    if (countOnly) {
      const { count, error: countError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)

      if (countError) {
        return apiError("알림 개수 조회 중 오류가 발생했습니다.", 500, countError)
      }

      return NextResponse.json({ unread_count: count || 0 })
    }

    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50)
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const unreadOnly = searchParams.get("unread_only") === "true"

    // 알림 조회
    let query = supabase
      .from("notifications")
      .select(
        `
        id,
        type,
        actor_id,
        related_post_id,
        related_comment_id,
        is_read,
        created_at,
        metadata
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq("is_read", false)
    }

    const { data: notifications, error } = await query

    if (error) {
      return apiError("알림을 불러오는 중 오류가 발생했습니다.", 500, error)
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ notifications: [], profiles: [], posts: [] })
    }

    // 작성자 프로필 조회
    const actorIds = [...new Set(notifications.map((n) => n.actor_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", actorIds)

    // 관련 글 제목 조회 (알림 텍스트 생성용)
    const postIds = [...new Set(notifications.map((n) => n.related_post_id).filter(Boolean))]
    const { data: posts } =
      postIds.length > 0
        ? await supabase.from("posts").select("id, title").in("id", postIds)
        : { data: [] }

    return NextResponse.json({ notifications, profiles: profiles || [], posts: posts || [] })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * PATCH /api/notifications
 * 알림 읽음 처리
 *
 * Body:
 * - notification_id?: 특정 알림 ID (없으면 모두 읽음 처리)
 */
export async function PATCH(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      return apiError("서버 설정 오류가 발생했습니다.", 500, error)
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 })
    }
    const NotificationSchema = z.object({ notification_id: z.string().optional() })
    const parsed = NotificationSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
    const { notification_id } = parsed.data

    let query = supabase.from("notifications").update({ is_read: true }).eq("user_id", userId)

    if (notification_id) {
      query = query.eq("id", notification_id)
    }

    const { error } = await query

    if (error) {
      return apiError("알림 읽음 처리 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
