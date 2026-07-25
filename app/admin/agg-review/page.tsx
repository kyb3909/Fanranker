import { createServiceRoleClient } from "@/lib/supabase/server"
import aggConfig from "@/data/agents/config/aggregator.json"
import { AggReviewClient, type AggReviewItem } from "./agg-review-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI 커뮤글 검수 | 관리자" }

interface Row {
  id: string
  source: string
  source_url: string
  source_title: string
  category: string | null
  rewritten: { title?: string; paragraphs?: string[]; intro?: string; persona_user_id?: string }
  media: { type: string; url?: string; rehosted_url?: string | null }[] | null
  created_at: string
}

export default async function AggReviewPage() {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("agg_reservoir")
    .select("id, source, source_url, source_title, category, rewritten, media, created_at")
    .eq("status", "drafted")
    .order("created_at", { ascending: false })
    .limit(50)

  // 오늘 발행 수 (KST 자정 기준) — 헤더의 cap 표시용
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
  const [{ count: publishedToday }, { count: queuedCount }] = await Promise.all([
    supabase
      .from("agg_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", kstMidnightUtc),
    supabase
      .from("agg_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ])

  const nicknameOf = (userId?: string) =>
    aggConfig.personas.find((p) => p.userId === userId)?.nickname ?? userId ?? "?"

  const items: AggReviewItem[] = ((data as Row[]) ?? []).map((r) => {
    const paragraphs = Array.isArray(r.rewritten?.paragraphs)
      ? r.rewritten.paragraphs
      : r.rewritten?.intro
        ? [r.rewritten.intro]
        : []
    return {
      id: r.id,
      source: r.source,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      category: r.category,
      persona: nicknameOf(r.rewritten?.persona_user_id),
      aiTitle: r.rewritten?.title ?? "(제목 없음)",
      aiBody: paragraphs.join("\n\n"),
      images: (r.media ?? [])
        .filter((m) => m.type === "image" && m.rehosted_url)
        .map((m) => m.rehosted_url as string)
        .slice(0, 4),
      createdAt: r.created_at,
    }
  })

  return (
    <div className="mx-auto max-w-[860px] p-6">
      <h1 className="text-xl font-bold">AI 커뮤글 검수 (페르소나 초안)</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        애그리게이터가 적재한 페르소나 초안입니다. 발행하면 <b>큐에 예약</b>되어 20~60분 간격으로
        페르소나 계정 이름으로 자유게시판에 분산 게시됩니다. 고쳐서 발행하면 그 교정이{" "}
        <b>자동으로 학습</b>되고, 반려 사유도 소재 회피 신호로 학습됩니다. 오늘 발행{" "}
        {publishedToday ?? 0}/{aggConfig.limits.dailyPublishCap}건 · 게시 대기 큐 {queuedCount ?? 0}
        건.
      </p>
      <AggReviewClient items={items} />
    </div>
  )
}
