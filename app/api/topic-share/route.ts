import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { TOPIC_KEYWORDS } from "@/lib/constants/topic-keywords"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const slug = request.nextUrl.searchParams.get("slug")

    // 대상 커뮤니티 결정
    const slugs = slug ? [slug] : ALL_COMMUNITIES.map((c) => c.slug)

    const results: Record<string, { label: string; count: number; color: string }[]> = {}

    for (const communitySlug of slugs) {
      const topics = TOPIC_KEYWORDS[communitySlug]
      if (!topics) continue

      // 해당 게시판의 최근 글 제목 가져오기 (최근 500개)
      const { data: posts } = await supabase
        .from("posts")
        .select("title")
        .eq("community_slug", communitySlug)
        .order("created_at", { ascending: false })
        .limit(500)

      // news_ticker_items에서도 가져오기
      const { data: news } = await supabase
        .from("news_ticker_items")
        .select("headline_kr, original_title")
        .eq("community_slug", communitySlug)
        .order("posted_at", { ascending: false })
        .limit(500)

      // 모든 텍스트 합치기
      const allTexts = [
        ...(posts || []).map((p) => p.title),
        ...(news || []).map((n) => n.headline_kr || n.original_title || ""),
      ].filter(Boolean)

      if (allTexts.length === 0) continue

      // 토픽별 키워드 매칭
      const topicCounts = topics.map((topic) => {
        let count = 0
        for (const text of allTexts) {
          const lower = text.toLowerCase()
          if (topic.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
            count++
          }
        }
        return { label: topic.label, count, color: topic.color }
      })

      // 매칭된 것만, 높은순 정렬
      const matched = topicCounts.filter((t) => t.count > 0).sort((a, b) => b.count - a.count)

      // "기타" 계산 - 어떤 토픽에도 매칭 안 된 글
      const matchedTexts = new Set<number>()
      for (let i = 0; i < allTexts.length; i++) {
        const lower = allTexts[i].toLowerCase()
        for (const topic of topics) {
          if (topic.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
            matchedTexts.add(i)
            break
          }
        }
      }
      const otherCount = allTexts.length - matchedTexts.size
      if (otherCount > 0) {
        matched.push({ label: "기타", count: otherCount, color: "bg-gray-400" })
      }

      results[communitySlug] = matched
    }

    return NextResponse.json({ data: results })
  } catch (error) {
    console.error("Topic share error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
