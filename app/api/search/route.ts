import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest } from "@/lib/api-error"

/**
 * GET /api/search
 * 검색 API
 *
 * Query Parameters:
 * - q: 검색어 (필수)
 * - type: 검색 타입 (nickname | id | title | title_content) (기본값: title_content)
 * - limit: 결과 개수 (기본값: 20)
 */
export async function GET(request: NextRequest) {
  try {
    // 환경 변수 확인
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ) {
      return apiError(
        "서버 설정 오류가 발생했습니다.",
        500,
        new Error("Supabase environment variables are not set")
      )
    }

    const supabase = createAnonClient()
    const searchParams = request.nextUrl.searchParams

    const query = searchParams.get("q")
    const type = searchParams.get("type") || "title_content" // 'nickname' | 'id' | 'title' | 'title_content'
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50)
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10))

    if (!query || query.trim().length === 0) {
      return apiBadRequest("검색어를 입력해주세요.")
    }

    if (query.length > 100) {
      return apiBadRequest("검색어는 100자 이하여야 합니다.")
    }

    const searchQuery = query.trim()

    let postsQuery = supabase
      .from("posts")
      .select(
        `
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        view_count,
        vote_count,
        comment_count,
        temperature,
        created_at
      `
      )
      .is("deleted_at", null)
      .range(offset, offset + limit - 1)

    // 검색 타입별 필터링
    switch (type) {
      case "nickname":
        // 닉네임으로 검색: profiles 테이블에서 닉네임으로 검색 후 user_id로 posts 조회
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("nickname", `%${searchQuery}%`)
          .limit(100) // 최대 100명까지

        if (!profiles || profiles.length === 0) {
          return NextResponse.json({ posts: [], profiles: [] })
        }

        const userIds = profiles.map((p) => p.user_id)
        postsQuery = postsQuery.in("user_id", userIds)
        break

      case "id":
        // ID로 검색: UUID 형식 정확 매치
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(searchQuery)) {
          return NextResponse.json({ posts: [], profiles: [] })
        }
        postsQuery = postsQuery.eq("id", searchQuery)
        break

      case "title":
        // 제목으로 검색
        postsQuery = postsQuery.ilike("title", `%${searchQuery}%`)
        break

      case "title_content":
      default:
        // 제목으로 검색 (content는 TipTap JSONB라 ilike 시 500 방지)
        postsQuery = postsQuery.ilike("title", `%${searchQuery}%`)
        break
    }

    // 최신순 정렬
    const { data: posts, error } = await postsQuery.order("created_at", { ascending: false })

    if (error) {
      return apiError("검색 중 오류가 발생했습니다.", 500, error)
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ posts: [], profiles: [] })
    }

    // 작성자 프로필 조회
    const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))]

    interface ProfileRow {
      user_id: string
      nickname: string
      avatar_url: string | null
    }
    let profiles: ProfileRow[] = []
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", userIds)

      if (profilesError) {
        console.error("Failed to fetch profiles:", profilesError)
        // 프로필 조회 실패해도 게시글은 반환
      } else {
        profiles = profilesData || []
      }
    }

    const res = NextResponse.json({ posts: posts || [], profiles })
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
