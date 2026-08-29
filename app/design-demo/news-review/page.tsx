import { createServiceRoleClient } from "@/lib/supabase/server"
import { isBreakingNewsItem } from "@/lib/news/breaking"
import { NewsReviewDemo, type DemoItem } from "./demo"

/**
 * 시안 — AI 뉴스 검수 화면, 진단 1~4번이 고쳐진 모습 (2026-08-30).
 *
 * 개발 환경 전용 (app/design-demo/layout.tsx 가 프로덕션 404).
 * **아무것도 쓰지 않는다** — 발행/반려 버튼은 화면 안에서만 동작하는 시연이다.
 * 데이터는 실제 검수 큐(news_reservoir drafted)를 그대로 읽는다.
 *
 * 고친 것 (진단 번호):
 *  ① 만료 시계 — 크론과 같은 규칙(일반 24h/브레이킹 48h), 클라이언트에서 실시간 감소
 *  ② 속보 매몰 — isBreakingNewsItem 을 **항목마다** 판정해 최상단 고정 + 뱃지
 *  ③ 원키 사고 — R 은 undo 토스트 5초, 처리 후 다음 건 자동 펼침(접힘 초기화 제거)
 *  ④ 판단 신호 — 티어/신뢰도/원제를 행에 노출, 원문·초안 나란히(2열)
 */

export const dynamic = "force-dynamic"

interface Row {
  id: string
  draft: {
    title?: string
    content?: unknown
    original?: { title?: string } | null
  } | null
  raw: { source_text?: string } | null
  urls: { source?: string | null } | null
  scores: Record<string, unknown> | null
  created_at: string
}

/** TipTap JSON → 문단 배열 (본 화면 preview() 와 같은 순회 — 시연이라 로컬 복제) */
function paragraphs(content: unknown): string[] {
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
  return out
}

export default async function NewsReviewDemoPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("news_reservoir")
    .select("id, draft, raw, urls, scores, created_at")
    .eq("status", "drafted")
    .filter("source->>type", "eq", "hermes")
    .order("created_at", { ascending: true })
    .limit(500)

  const items: DemoItem[] = ((data as Row[]) ?? []).map((r) => {
    const breaking = isBreakingNewsItem({
      draftTitle: r.draft?.title ?? null,
      originalTitle: r.draft?.original?.title ?? null,
      sourceUrl: r.urls?.source ?? null,
    })
    return {
      id: r.id,
      title: r.draft?.title ?? "(제목 없음)",
      originalTitle: r.draft?.original?.title ?? null,
      body: paragraphs(r.draft?.content),
      sourceText: r.raw?.source_text ?? null,
      credibility:
        typeof r.scores?.credibility === "number" ? (r.scores.credibility as number) : null,
      breaking,
      createdAt: r.created_at,
      // ① 크론과 같은 규칙 — 여기가 이 시안의 심장이다
      expiresAt: new Date(
        new Date(r.created_at).getTime() + (breaking ? 48 : 24) * 3600_000
      ).toISOString(),
    }
  })

  return <NewsReviewDemo items={items} />
}
