import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/titles/display?user_ids=id1,id2&board_slug=football
 *
 * 여러 유저의 장착 칭호를 일괄 조회 (게시글/댓글 목록에서 사용)
 * 비로그인도 접근 가능 (공개 정보)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userIdsParam = searchParams.get("user_ids")
    const boardSlug = searchParams.get("board_slug")

    if (!userIdsParam || !boardSlug) {
      return NextResponse.json({ title_displays: {} })
    }

    const userIds = userIdsParam.split(",").filter(Boolean).slice(0, 100)
    if (userIds.length === 0) {
      return NextResponse.json({ title_displays: {} })
    }

    const supabase = createAnonClient()

    const { data: equipped, error } = await supabase
      .from("user_equipped_titles")
      .select(
        `
        user_id,
        adj_title_id,
        noun_title_id,
        adj_titles ( title, rarity ),
        noun_titles ( title )
      `
      )
      .eq("board_slug", boardSlug)
      .in("user_id", userIds)

    if (error) {
      return apiError("칭호 조회 중 오류가 발생했습니다.", 500, error)
    }

    // { userId: { adjTitle, nounTitle, rarity } } 형태로 변환
    const titleDisplays: Record<
      string,
      { adjTitle: string | null; nounTitle: string | null; rarity: string | null }
    > = {}

    for (const row of equipped || []) {
      const adjData = row.adj_titles as unknown as { title: string; rarity: string } | null
      const nounData = row.noun_titles as unknown as { title: string } | null

      titleDisplays[row.user_id] = {
        adjTitle: adjData?.title || null,
        nounTitle: nounData?.title || null,
        rarity: adjData?.rarity || null,
      }
    }

    const res = NextResponse.json({ title_displays: titleDisplays })
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
