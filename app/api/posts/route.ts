import { NextRequest, NextResponse } from "next/server"
import { createAnonClient, createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { computeTemperature, type TemperatureInput } from "@/lib/temperature"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { isUserSuspended } from "@/lib/check-suspension"
import { awardPoints, POINT_VALUES } from "@/lib/points"
import { isAllowedImageUrl } from "@/lib/validate-image-url"
import { z } from "zod"

const MAX_CONTENT_SIZE = 100_000 // 100KB

const PostCreateSchema = z.object({
  community_slug: z.string().min(1, "게시판을 선택해주세요."),
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  content: z
    .any()
    .refine((v) => v !== undefined && v !== null && v !== "", {
      message: "내용을 입력해주세요.",
    })
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= MAX_CONTENT_SIZE
        } catch {
          return false
        }
      },
      { message: "내용이 너무 깁니다. (최대 100KB)" }
    ),
  image: z.string().nullable().optional(),
})

/**
 * GET /api/posts
 * 글 목록 조회 (홈 피드용)
 *
 * Query Parameters:
 * - community_slug?: 특정 커뮤니티만 필터링
 * - sort?: "hot" | "new" | "comments" (정렬 방식)
 * - limit?: 페이지당 개수 (기본 20)
 * - offset?: 페이지네이션 오프셋 (기본 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const searchParams = request.nextUrl.searchParams

    const communitySlug = searchParams.get("community_slug")
    const communitySlugsParam = searchParams.get("community_slugs")
    const sort = searchParams.get("sort") || "new" // 'hot', 'new', 'comments', 'recent_comments'
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50)
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10))

    // 팔로우 게시판 필터: 클라이언트에서 전달받은 slug 목록 사용
    const followedSlugs = communitySlugsParam
      ? communitySlugsParam.split(",").filter(Boolean)
      : null

    // 최근 댓글이 달린 게시물 조회 (RPC로 1 round trip)
    if (sort === "recent_comments") {
      const { data, error } = await supabase.rpc("get_recent_commented_posts", {
        p_limit: limit,
        p_community_slug: communitySlug || null,
      })

      if (error) {
        console.error("Failed to fetch recent commented posts:", error)
        return NextResponse.json(
          { error: "글 목록을 가져오는 중 오류가 발생했습니다." },
          { status: 500 }
        )
      }

      const result = data || { posts: [], profiles: [] }
      const posts = (result.posts || []).map((post: Record<string, unknown>) => ({
        ...post,
        temperature: computeTemperature(post as unknown as TemperatureInput),
      }))

      const res = NextResponse.json({ posts, profiles: result.profiles || [] })
      res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300")
      return res
    }

    // 정렬 로직 (hot, new, comments)
    const buildQuery = () => {
      let q = supabase
        .from("posts")
        .select(
          `
          id,
          user_id,
          community_slug,
          title,
          content,
          image,
          vote_count,
          comment_count,
          temperature,
          created_at
        `
        )
        .is("deleted_at", null)
        .range(offset, offset + limit - 1)

      // 커뮤니티 필터링
      if (communitySlug) {
        q = q.eq("community_slug", communitySlug)
      } else if (followedSlugs) {
        q = q.in("community_slug", followedSlugs)
      }

      // 정렬
      switch (sort) {
        case "hot":
          q = q.order("temperature", { ascending: false, nullsFirst: false })
          break
        case "comments":
          q = q.order("comment_count", { ascending: false })
          break
        case "new":
        default:
          q = q.order("created_at", { ascending: false })
          break
      }

      return q
    }

    // 단일 쿼리로 조회 (CDN 캐시 s-maxage=30으로 DB 부하 제어)
    const result = await buildQuery()
    const posts = result.data
    const error = result.error

    if (error) {
      console.error("Failed to fetch posts:", error)
      return NextResponse.json(
        { error: "글 목록을 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ posts: [], profiles: [] })
    }

    // DB temperature 값 그대로 사용 (pg_cron이 매분 큐 처리)
    const postsWithAccurateCounts = posts

    // 3. 작성자 프로필 조회
    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, temperature")
      .in("user_id", userIds)

    const res = NextResponse.json({
      posts: postsWithAccurateCounts,
      profiles,
      hasMore: posts.length === limit,
    })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=180")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * POST /api/posts
 * 새 글 작성
 *
 * Route Handler에서 Supabase 서버 클라이언트를 사용합니다.
 * Clerk 인증된 사용자만 글을 작성할 수 있습니다.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    // Clerk 인증 확인
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
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
    const result = PostCreateSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { community_slug, title, content, image } = result.data

    // 이미지 URL 유효성 검사 (허용된 도메인만)
    let imageUrl = null
    if (image) {
      if (!isAllowedImageUrl(image)) {
        return NextResponse.json(
          { error: "허용되지 않은 이미지 URL입니다. 이미지를 다시 업로드해주세요." },
          { status: 400 }
        )
      }
      imageUrl = image
    }

    // Supabase에 글 저장
    // community_slug → category_id 변환은 DB 트리거가 자동 처리
    const { data, error } = await supabase
      .from("posts")
      .insert({
        user_id: userId, // Clerk user ID
        community_slug,
        title,
        content, // TipTap JSON
        image: imageUrl,
      })
      .select()
      .single()

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error: "글 저장 중 오류가 발생했습니다." }, { status: 500 })
    }

    // 포인트 적립 (비동기, 실패 무시)
    awardPoints(
      supabase,
      userId,
      community_slug,
      POINT_VALUES.post,
      "post",
      "글 작성",
      String(data.id)
    ).catch((err: unknown) => console.error("Failed to award points for post:", err))

    // 팔로워들에게 알림 생성 (비동기로 처리, 실패해도 무시)
    Promise.resolve(
      supabase.from("user_follows").select("follower_id").eq("followed_user_id", userId)
    )
      .then(({ data: followers }) => {
        if (!followers || followers.length === 0) return

        // 각 팔로워에게 알림 생성
        const notifications = followers.map((follow) => ({
          user_id: follow.follower_id,
          type: "new_post_by_followed",
          actor_id: userId,
          related_post_id: data.id,
          related_comment_id: null,
          is_read: false,
        }))

        return supabase.from("notifications").insert(notifications)
      })
      .catch((err: unknown) => {
        console.error("Failed to create notifications for followers:", err)
      })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
