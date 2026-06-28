import { createServiceRoleClient } from "@/lib/supabase/server"
import { NewsReviewClient, type ReviewItem } from "./review-client"

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
  const { data } = await supabase
    .from("news_reservoir")
    .select("id, draft, urls, scores, created_at")
    .eq("status", "drafted")
    .filter("source->>type", "eq", "hermes") // Hermes 에이전트 초안만 (TS 파이프라인 초안과 분리)
    .order("created_at", { ascending: false })
    .limit(50)

  const items: ReviewItem[] = ((data as Row[]) ?? []).map((r) => ({
    id: r.id,
    title: r.draft?.title ?? "(제목 없음)",
    content: r.draft?.content ?? null,
    tags: r.draft?.tags ?? [],
    sourceUrl: r.urls?.source ?? null,
    originUrl: r.urls?.origin ?? null,
    scores: r.scores ?? {},
    createdAt: r.created_at,
  }))

  return (
    <div className="mx-auto max-w-[860px] p-6">
      <h1 className="text-xl font-bold">뉴스 검수 (Hermes 초안)</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        에이전트가 적재한 초안입니다. 발행하면 <b>풋볼매니아_kr</b> 이름으로 축구 게시판에
        올라갑니다. 반려하면 발행되지 않습니다.
      </p>
      <NewsReviewClient items={items} />
    </div>
  )
}
