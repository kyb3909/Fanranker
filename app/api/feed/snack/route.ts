import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/feed/snack?before=<ISO> — 떡밥 피드 카드 (비로그인 공개).
 * 이미지 있는 글(페르소나 커뮤글·뉴스·유저글)을 풀스크린 스와이프 카드로 서빙.
 * 커서 페이징(created_at) — 무한 스크롤용.
 */
export async function GET(req: NextRequest) {
  try {
    const before = req.nextUrl.searchParams.get("before")
    const supabase = createServiceRoleClient()

    let query = supabase
      .from("posts")
      .select("id, title, image, user_id, community_slug, vote_count, comment_count, created_at")
      .is("deleted_at", null)
      .not("image", "is", null)
      .order("created_at", { ascending: false })
      .limit(30)
    if (before) query = query.lt("created_at", before)

    const { data: posts, error } = await query
    if (error) {
      apiError("Snack feed query error", 500, error)
      return NextResponse.json({ cards: [] })
    }

    const rows = posts ?? []
    // 닉네임 부착 (profiles 임베드 FK 이슈 회피 — 별도 조회 후 매핑)
    const userIds = [...new Set(rows.map((p) => p.user_id).filter(Boolean))]
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, nickname").in("user_id", userIds)
      : { data: [] }
    const nickOf = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname]))

    const cards = rows.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.image,
      nickname: nickOf.get(p.user_id) ?? "익명",
      voteCount: p.vote_count ?? 0,
      commentCount: p.comment_count ?? 0,
      createdAt: p.created_at,
    }))

    return NextResponse.json(
      { cards, nextCursor: rows.length === 30 ? rows[rows.length - 1].created_at : null },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    )
  } catch (error) {
    apiError("Snack feed error", 500, error)
    return NextResponse.json({ cards: [] })
  }
}
