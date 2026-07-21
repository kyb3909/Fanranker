import { createServiceRoleClient } from "@/lib/supabase/server"
import { suggestFlairs, type FlairOption } from "@/lib/news/suggest-flair"
import { NewsReviewClient, type ReviewItem, type FlairChoice } from "./review-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "뉴스 검수 | 관리자" }

interface Row {
  id: string
  draft: { title?: string; content?: unknown; tags?: string[] } | null
  urls: { source?: string | null; origin?: string | null } | null
  scores: Record<string, unknown> | null
  created_at: string
}

export default async function NewsReviewPage() {
  const supabase = createServiceRoleClient()

  // 축구 게시판 활성 말머리 (UI 선택지 + 자동 추천 근거)
  const { data: flairRows } = await supabase
    .from("post_flairs")
    .select("id, name, color, team_id")
    .eq("community_slug", "football")
    .eq("is_active", true)
    .order("sort_order")
  const flairs: FlairChoice[] = (flairRows as FlairChoice[]) ?? []
  const suggestOpts: FlairOption[] = flairs.map((f) => ({
    id: f.id,
    name: f.name,
    team_id: f.team_id,
  }))

  const { data } = await supabase
    .from("news_reservoir")
    .select("id, draft, urls, scores, created_at")
    .eq("status", "drafted")
    .filter("source->>type", "eq", "hermes") // Hermes 에이전트 초안만 (TS 파이프라인 초안과 분리)
    .order("created_at", { ascending: false })
    .limit(50)

  const items: ReviewItem[] = ((data as Row[]) ?? []).map((r) => {
    const title = r.draft?.title ?? "(제목 없음)"
    return {
      id: r.id,
      title,
      content: r.draft?.content ?? null,
      tags: r.draft?.tags ?? [],
      sourceUrl: r.urls?.source ?? null,
      originUrl: r.urls?.origin ?? null,
      scores: r.scores ?? {},
      createdAt: r.created_at,
      // 제목 기반 자동 추천 말머리 (검수자가 수정 가능)
      suggestedFlairIds: suggestFlairs(title, suggestOpts).flairIds,
    }
  })

  return (
    <div className="mx-auto max-w-[860px] p-6">
      <h1 className="text-xl font-bold">뉴스 검수 (Hermes 초안)</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        에이전트가 적재한 초안입니다. 발행하면 <b>공놀이봇</b> 이름으로 축구 게시판에 올라갑니다.
        말머리는 제목으로 자동 추천되며 발행 전에 눌러서 바꿀 수 있습니다. 담벼락에는{" "}
        <b>대표 1개(팀·리그 우선)</b>만 표시되고, 나머지는 검색·필터용으로 함께 저장됩니다.
      </p>
      <NewsReviewClient items={items} flairs={flairs} />
    </div>
  )
}
