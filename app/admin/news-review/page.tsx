import { createServiceRoleClient } from "@/lib/supabase/server"
import { suggestFlairs, type FlairOption } from "@/lib/news/suggest-flair"
import { SagaReviewQueue } from "@/components/admin/saga-review-queue"
import { FastReview, type DeskItem, type FlairChoice, type SagaOption } from "./fast-review"

export const dynamic = "force-dynamic"
export const metadata = { title: "뉴스 검수 | 관리자" }

/** 초안은 48시간 뒤 news-expire-drafts 크론이 자동 반려한다 */
const EXPIRE_HOURS = 48

interface Row {
  id: string
  draft: {
    title?: string
    content?: unknown
    tags?: string[]
    vs?: { question: string; option_a: string; option_b: string; confidence: number } | null
  } | null
  raw: { source_text?: string } | null
  urls: { source?: string | null; origin?: string | null } | null
  scores: Record<string, unknown> | null
  created_at: string
}

/** TipTap JSON → 미리보기 텍스트 (카드에서 본문 앞부분을 바로 읽게) */
function preview(content: unknown): string {
  const out: string[] = []
  const walk = (n: unknown) => {
    const node = n as { type?: string; text?: string; content?: unknown[] } | null
    if (!node) return
    if (node.type === "paragraph") {
      const t = (node.content ?? []).map((c) => (c as { text?: string }).text ?? "").join("")
      if (t.trim()) out.push(t.trim())
    }
    for (const c of node.content ?? []) walk(c)
  }
  walk(content)
  return out.join(" ")
}

/** 본문 첫 이미지 — "오늘의 떡밥" 카드 자격 여부를 검수자가 바로 알게 한다 */
function firstImage(content: unknown): string | null {
  let found: string | null = null
  const walk = (n: unknown) => {
    if (found) return
    const node = n as { type?: string; attrs?: { src?: string }; content?: unknown[] } | null
    if (!node) return
    if (node.type === "image" && node.attrs?.src) {
      found = node.attrs.src
      return
    }
    for (const c of node.content ?? []) walk(c)
  }
  walk(content)
  return found
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

  // 활성 사가 목록 — 검수하면서 기사를 특정 사가에 붙이거나 새 사가를 만들 수 있게
  // (2026-08-04 운영자). 최근 활동순 = 셀렉트에서 지금 뜨거운 사가가 위에 온다.
  const { data: sagaRows } = await supabase
    .from("sagas")
    .select("id, title, saga_type, stage")
    .eq("status", "active")
    .order("last_event_at", { ascending: false })
    .limit(200)
  const sagas: SagaOption[] = (sagaRows as SagaOption[]) ?? []

  // 전량 조회 — 옛 화면은 50건 제한이라 나머지가 존재조차 안 보인 채 만료됐다.
  // 정렬은 **오래된 것부터**: 먼저 사라질 것을 먼저 보여준다(만료 임박 우선).
  const { data } = await supabase
    .from("news_reservoir")
    .select("id, draft, raw, urls, scores, created_at")
    .eq("status", "drafted")
    .filter("source->>type", "eq", "hermes") // Hermes 에이전트 초안만 (TS 파이프라인 초안과 분리)
    .order("created_at", { ascending: true })
    .limit(500)

  const items: DeskItem[] = ((data as Row[]) ?? []).map((r) => {
    const title = r.draft?.title ?? "(제목 없음)"
    const body = preview(r.draft?.content)
    const createdMs = new Date(r.created_at).getTime()
    return {
      id: r.id,
      title,
      body,
      bodyLength: body.length,
      image: firstImage(r.draft?.content),
      content: r.draft?.content ?? null,
      sourceText: r.raw?.source_text ?? null,
      sourceUrl: r.urls?.source ?? null,
      createdAt: r.created_at,
      hoursLeft: Math.max(0, EXPIRE_HOURS - (Date.now() - createdMs) / 3600_000),
      credibility: Number(r.scores?.credibility ?? 0) || null,
      importance: Number(r.scores?.importance ?? 0) || null,
      suggestedFlairIds: suggestFlairs(title, suggestOpts).flairIds,
      vs: r.draft?.vs ?? null,
    }
  })

  return (
    <div className="mx-auto max-w-[900px] p-6">
      <FastReview items={items} flairs={flairs} sagas={sagas} />
      <p className="text-muted-foreground mt-4 text-xs">
        발행하면 <b>공놀이봇</b> 이름으로 축구 게시판에 올라갑니다. 말머리는 제목으로 자동 추천되며
        발행 전에 눌러서 바꿀 수 있고, 담벼락에는 <b>대표 1개(팀·리그 우선)</b>만 표시됩니다.
        제목·본문을 고쳐서 발행하면 그 표기가 사전에 학습돼 다음 기사에 반영됩니다.
      </p>
      {/* 사가 검수 — 별도 페이지에서 통합 (2026-08-04 운영자: "검수는 하나로") */}
      <SagaReviewQueue />
    </div>
  )
}
