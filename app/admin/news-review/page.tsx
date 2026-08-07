import { createServiceRoleClient } from "@/lib/supabase/server"
import { suggestFlairs, type FlairOption } from "@/lib/news/suggest-flair"
import { isBreakingNewsItem } from "@/lib/news/breaking"
import { SagaReviewQueue } from "@/components/admin/saga-review-queue"
import { PublishedFixes } from "@/components/admin/published-fixes"
import { PlayerDictionaryCandidates } from "@/components/admin/player-dictionary"
import { FastReview, type DeskItem, type FlairChoice, type SagaOption } from "./fast-review"

export const dynamic = "force-dynamic"
export const metadata = { title: "뉴스 검수 | 관리자" }

/** 초안은 24시간 뒤 news-expire-drafts 크론이 자동 반려한다 */
const EXPIRE_HOURS = 24

interface Row {
  id: string
  draft: {
    title?: string
    content?: unknown
    tags?: string[]
    original?: { title?: string } | null
    vs?: { question: string; option_a: string; option_b: string; confidence: number } | null
  } | null
  raw: { source_text?: string } | null
  urls: { source?: string | null; origin?: string | null } | null
  scores: Record<string, unknown> | null
  created_at: string
}

/** 자동발행이 못 내보낸 사유 → 검수자용 한글 라벨 (미지정 코드는 원문 노출) */
const STUCK_REASON_LABEL: Record<string, string> = {
  no_image: "이미지 없음",
  prior_gate_rejected: "이전 게이트 탈락",
  official_unverified: "오피셜 실보도 미확인",
  quality_gate_rejected: "검사관 반려",
  naming_check_unavailable: "표기 검증 인프라 장애",
  image_check_unavailable: "이미지 검증 인프라 장애",
  official_check_unavailable: "오피셜 대조 인프라 장애",
}

function stuckReasonLabel(code: string | null): string {
  if (!code) return "사유 미기록"
  if (code.startsWith("unknown_player")) return "선수 사전 미등재"
  return STUCK_REASON_LABEL[code] ?? code
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

  // "지금 막힌 것" — 자동발행이 검수로 넘긴 후보의 상태·사유 집계 (P1-3,
  // 비니시우스 실사고 후속: 오피셜이 어디에 왜 잠겨 있는지 큐 위에서 바로 보이게)
  const rows = (data as Row[]) ?? []
  const draftedIds = rows.map((r) => r.id)
  const rowMap = new Map(rows.map((r) => [r.id, r]))
  let stuck: {
    total: number
    needsHuman: number
    retryWait: number
    breaking: number
    oldestHours: number
    reasons: [string, number][]
  } | null = null
  if (draftedIds.length > 0) {
    const { data: candRows } = await supabase
      .from("news_candidates")
      .select("candidate_id, state, last_reason_code, updated_at")
      .in("state", ["needs_human", "retry_wait"])
      .in("candidate_id", draftedIds)
    const cands = (candRows ?? []) as {
      candidate_id: string
      state: string
      last_reason_code: string | null
      updated_at: string
    }[]
    if (cands.length > 0) {
      const needsHuman = cands.filter((c) => c.state === "needs_human")
      const breaking = needsHuman.filter((c) => {
        const r = rowMap.get(c.candidate_id)
        return (
          r &&
          isBreakingNewsItem({
            draftTitle: r.draft?.title ?? null,
            originalTitle: r.draft?.original?.title ?? null,
            sourceUrl: r.urls?.source ?? null,
          })
        )
      })
      const oldestMs = Math.min(...cands.map((c) => new Date(c.updated_at).getTime()))
      const reasonCounts = new Map<string, number>()
      for (const c of cands) {
        const label = stuckReasonLabel(c.last_reason_code)
        reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1)
      }
      stuck = {
        total: cands.length,
        needsHuman: needsHuman.length,
        retryWait: cands.length - needsHuman.length,
        breaking: breaking.length,
        oldestHours: Math.round((Date.now() - oldestMs) / 3600_000),
        reasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]),
      }
    }
  }

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
      {/* 지금 막힌 것 — 자동발행이 못 내보낸 후보의 사유별 현황 (0건이면 숨김) */}
      {stuck && (
        <div className="mb-4 rounded-xl border bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
          <p className="font-bold">
            지금 막힌 것 {stuck.total}건
            {stuck.breaking > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {" "}
                · 🚨 오피셜급 {stuck.breaking}건
              </span>
            )}
            <span className="text-muted-foreground font-normal">
              {" "}
              · 검수 필요 {stuck.needsHuman} / 자동 재시도 대기 {stuck.retryWait} · 최장 대기{" "}
              {stuck.oldestHours}시간
            </span>
          </p>
          <p className="text-muted-foreground mt-1">
            {stuck.reasons.map(([label, n]) => `${label} ${n}건`).join(" · ")}
          </p>
        </div>
      )}
      <FastReview items={items} flairs={flairs} sagas={sagas} />
      <p className="text-muted-foreground mt-4 text-xs">
        발행하면 <b>공놀이봇</b> 이름으로 축구 게시판에 올라갑니다. 말머리는 제목으로 자동 추천되며
        발행 전에 눌러서 바꿀 수 있고, 담벼락에는 <b>대표 1개(팀·리그 우선)</b>만 표시됩니다.
        제목·본문을 고쳐서 발행하면 그 표기가 사전에 학습돼 다음 기사에 반영됩니다.
      </p>
      {/* 표기 사전 후보 — 자동발행을 막은 이름을 1클릭 등재 (실측 병목 1위) */}
      <PlayerDictionaryCandidates />
      {/* 사가 검수 — 별도 페이지에서 통합 (2026-08-04 운영자: "검수는 하나로") */}
      <SagaReviewQueue />
      {/* 발행 후 교정 — 기사·사가 연표·사가 이름. 고치면 표기 학습으로 이어진다 */}
      <PublishedFixes />
    </div>
  )
}
