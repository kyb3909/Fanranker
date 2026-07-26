import { NextRequest, NextResponse } from "next/server"
import { fetchCardNews } from "@/lib/feed/cardnews"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/feed/cardnews?before=<ISO> — 카드뉴스 피드 (비로그인 공개).
 * 오버레이 카드형 홈 피드용. 커서 페이징(created_at).
 */
export async function GET(req: NextRequest) {
  try {
    const before = req.nextUrl.searchParams.get("before")
    const data = await fetchCardNews(before)
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    })
  } catch (error) {
    apiError("Cardnews feed error", 500, error)
    return NextResponse.json({ cards: [], nextCursor: null })
  }
}
