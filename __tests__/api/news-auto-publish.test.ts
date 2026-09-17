import { describe, it, expect, vi, beforeEach } from "vitest"
import { NEWS_WRITER_POLICY_VERSION } from "@/scripts/vps-news-scanner/writer-policy.mjs"
import type { EditorialRule } from "@/lib/news/training/types"

/**
 * 뉴스 자동발행 cron — 검수 없이 담벼락에 나가는 유일한 경로.
 * 여기서 잠그는 계약:
 *   · 이미지 없는 초안은 구단 카드를 붙여 내보낸다 (2026-08-11 — 이전엔 사람 검수행이었다)
 *   · 일일 상한은 없고 회당 2건 페이싱만 적용한다
 *   · 자동 스킵 사유를 응답에 집계해 무기록 탈락을 막는다
 *   · 킬스위치 env 로 배포 없이 끌 수 있다
 *   · 자동발행분은 publish.auto=true 로 표시된다 (사후 회수용)
 *   · 후보 원장의 마지막 상태가 실제 결과와 일치한다 (2026-08-05 순서 역전 회귀)
 *   · 판정이 안 바뀐 정체 후보를 매 회차 다시 기록하지 않는다
 */

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>()
  return { ...mod, after: (fn: () => void) => fn() }
})

// 디스코드/학습/말머리 추천은 이 테스트의 관심사가 아니다 — no-op 모킹
vi.mock("@/lib/discord/news-notify", () => ({
  notifyNewsPublished: vi.fn().mockResolvedValue(undefined),
  resolveNewsChannel: () => "football",
}))
vi.mock("@/lib/news/learn-corrections", () => ({
  learnFromDeskEdit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/news/suggest-flair", () => ({
  suggestFlairs: () => ({ flairIds: [] }),
}))
vi.mock("@/lib/cron/log-run", () => ({
  withCronLog: (_name: string, handler: (request: Request) => Promise<Response>) => handler,
}))
const inspectImageMock = vi.fn()
const publishingSettingsMock = vi.fn()
const editorialRulesMock = vi.fn()
vi.mock("@/lib/news/training/settings", () => ({
  loadPublishingSettings: (...args: unknown[]) => publishingSettingsMock(...args),
  loadEditorialRules: (...args: unknown[]) => editorialRulesMock(...args),
}))
vi.mock("@/lib/news/quality-gate", () => ({
  // 검사관은 유지하되 작성 모델과 다른 모델로 돈다 (quality-gate.ts 상단 참조)
  inspectDraft: vi
    .fn()
    .mockResolvedValue({ pass: true, reasons: [], playerNamesKr: [], coachNamesKr: [] }),
  // 검사관 대체 — 도박 홍보 낱말 검사 (기본은 통과)
  hasGamblingPromo: vi.fn().mockReturnValue(null),
  inspectImage: (url: string) => inspectImageMock(url),
  unknownPlayerNames: vi.fn().mockReturnValue([]),
  PERSONAL_BLOG_RE: /substack\.com/i,
  isWomensFootball: (...texts: (string | null | undefined)[]) =>
    /women|여자\s*축구/i.test(texts.filter(Boolean).join(" ")),
  // 원문 리드 기반 판정 (2026-08-09 케롤린 실사고) — 한국어에는 성별 단서가 안 남는다
  isWomensFootballSource: (src: string | null | undefined) => /\bWSL\b/.test(src ?? ""),
}))
const titleSimilarityMock = vi.fn((..._args: unknown[]) => 0)
const followupMock = vi.fn()
vi.mock("@/lib/saga/cluster", () => ({
  titleSimilarity: (...args: unknown[]) => titleSimilarityMock(...args),
}))
vi.mock("@/lib/news/followup", () => ({
  inspectNewsFollowup: (...args: unknown[]) => followupMock(...args),
}))
const rehostMock = vi.fn(async (src: string, _userId?: string) => src)
vi.mock("@/lib/images/rehost", () => ({
  isSelfHostedImageUrl: () => true,
  rehostExternalImage: (src: string, userId: string) => rehostMock(src, userId),
}))
vi.mock("@/lib/saga/publish", () => ({
  linkArticleToSaga: vi.fn().mockResolvedValue(null),
  linkArticleToSagaChosen: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/news/vs-issue", () => ({
  createVsPollFromDraft: vi.fn().mockResolvedValue(null),
}))

interface DraftRow {
  id: string
  updated_at: string
  status: string
  urls: { source?: string | null } | null
  draft: { title?: string; content?: unknown; original?: { title?: string } }
  entities: null
  tags: null
  decision: Record<string, unknown> | null
  created_at: string
  raw?: { source_text?: string; original_title?: string; editorial_guidance?: unknown }
}

let drafts: DraftRow[] = []
let botPublishedToday = 0
let autoPublishedToday = 0
let recentPostRows: { title: string; source_url: string | null; content?: unknown }[] = []
let recentPostsError: { message: string } | null = null
let atomicOutcome: "published" | "already_published" | "duplicate" = "published"
let beforeStaleUpdate: ((row: DraftRow) => void) | null = null
let staleWriteError: { message: string } | null = null
let knownCandidates: { candidate_id: string; state: string; last_reason_code: string | null }[] = []
const inserted: Record<string, unknown>[] = []
const reservoirUpdates: Array<{ id: string; patch: Record<string, unknown> }> = []
/** 원장 RPC 로 실제로 흘러간 전이 — 호출 순서대로 평탄화해 순서 계약을 검증한다 */
const ledgerEvents: { candidate_id: string; to_state: string; reason_code?: string }[] = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === "publish_news_draft_atomic") {
        if (atomicOutcome !== "published") {
          return {
            data: { outcome: atomicOutcome, post_id: "existing-post", title: "동일 원문 기사" },
            error: null,
          }
        }
        inserted.push(args.p_post)
        const postId = `post_${inserted.length}`
        reservoirUpdates.push({
          id: args.p_reservoir_id,
          patch: {
            status: "published",
            draft: args.p_draft,
            publish: { ...args.p_publish, post_id: postId, published_at: new Date().toISOString() },
          },
        })
        return { data: { outcome: "published", post_id: postId }, error: null }
      }
      ledgerEvents.push(...args.p_events)
      return { data: args.p_events.length, error: null }
    },
    from: (table: string) => {
      if (table === "news_candidates") {
        return {
          select: () => ({ in: async () => ({ data: knownCandidates, error: null }) }),
        }
      }
      if (table === "posts") {
        return {
          select: (_columns: string, options?: { head?: boolean }) =>
            options?.head
              ? {
                  eq: () => ({
                    gte: async () => ({ count: botPublishedToday, error: null }),
                  }),
                }
              : {
                  eq: () => ({
                    is: () => ({
                      gte: async () => ({ data: recentPostRows, error: recentPostsError }),
                    }),
                  }),
                },
          insert: (row: Record<string, unknown>) => {
            inserted.push(row)
            return {
              select: () => ({
                single: async () => ({ data: { id: `post_${inserted.length}` }, error: null }),
              }),
            }
          },
        }
      }
      if (table === "news_reservoir") {
        return {
          select: (_columns: string, options?: { head?: boolean }) =>
            options?.head
              ? {
                  eq: () => ({
                    contains: () => ({
                      gte: async () => ({ count: autoPublishedToday, error: null }),
                    }),
                  }),
                }
              : {
                  eq: () => ({
                    gte: () => ({
                      order: () => ({ limit: async () => ({ data: drafts, error: null }) }),
                    }),
                  }),
                },
          update: (patch: Record<string, unknown>) => {
            const filters = new Map<string, unknown>()
            const execute = () => {
              const id = String(filters.get("id"))
              if (patch.status === "rejected") {
                const current = drafts.find((row) => row.id === id)
                if (current) beforeStaleUpdate?.(current)
                if (staleWriteError) return { data: null, error: staleWriteError }
                if (
                  !current ||
                  [...filters].some(([key, value]) => current[key as keyof DraftRow] !== value)
                ) {
                  return { data: null, error: null }
                }
                Object.assign(current, patch)
              }
              reservoirUpdates.push({ id, patch })
              return { data: { id }, error: null }
            }
            const query = {
              eq: (key: string, value: unknown) => {
                filters.set(key, value)
                return query
              },
              select: () => query,
              maybeSingle: async () => execute(),
              then: (resolve: (value: ReturnType<typeof execute>) => unknown) =>
                Promise.resolve(execute()).then(resolve),
            }
            return query
          },
        }
      }
      if (table === "news_alias_dictionary") {
        // fetchDictionaryRows 의 페이지 조회 체인 (.in → .order → .range).
        // category in (player, coach) — 감독 표기 게이트 (2026-08-09)
        return {
          select: () => ({
            in: () => ({
              order: () => ({ range: async () => ({ data: [], error: null }) }),
            }),
          }),
        }
      }
      if (table === "team_dictionary") {
        // 오피셜 웹 대조용 클럽 표기 로드 (2026-08-08) — 테스트에선 빈 사전
        return {
          select: async () => ({ data: [], error: null }),
        }
      }
      if (table === "post_flairs" || table === "post_flair_map") {
        return {
          select: () => ({
            eq: () => ({ eq: async () => ({ data: [], error: null }) }),
            in: async () => ({ data: [], error: null }),
          }),
          insert: async () => ({ error: null }),
        }
      }
      throw new Error(`예상치 못한 테이블: ${table}`)
    },
  }),
}))

// 본문은 무내용 게이트(80자 미만 차단)를 넘도록 실제 기사 분량으로
const LONG_BODY =
  "아스날이 에미레이트 스타디움에서 열린 프리미어리그 홈 경기에서 리버풀을 상대로 2-0 승리를 거뒀다. 전반 23분 사카가 선제골을 넣었고, 후반 78분 마르티넬리가 쐐기골을 추가하며 승점 3점을 확보했다."
const visualDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: LONG_BODY }] },
    { type: "image", attrs: { src: "https://example.com/a.jpg" } },
  ],
}
const textOnlyDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "글만 있는 기사" }] }],
}

const currentRules: EditorialRule[] = [
  {
    id: "8f228310-bbe8-44b5-a705-c31d217e1401",
    title: "존댓말 없는 건조한 기사체",
    instruction: "서술과 간접 인용은 한다·했다체로 통일한다.",
    category: "style",
    priority: 100,
    active: true,
    version: 0,
    updated_at: "2026-09-15T18:19:03.445Z",
  },
  {
    id: "8f228310-bbe8-44b5-a705-c31d217e1402",
    title: "첫 문단에 요지, 이후 출처와 세부 내용",
    instruction: "첫 문단은 요지, 다음 문단에 매체 출처를 설명한다.",
    category: "structure",
    priority: 95,
    active: true,
    version: 0,
    updated_at: "2026-09-15T18:19:03.496Z",
  },
]
const currentGuidance = {
  policy_version: NEWS_WRITER_POLICY_VERSION,
  loaded_at: "2026-09-15T20:15:00.000Z",
  applied_rule_ids: currentRules.map((rule) => rule.id),
}
// Actual published copy reported by the editor on 2026-09-16.
const solankeDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: '더 타임스 보도에 따르면 로베르토 데 제르비 토트넘 감독은 도미닉 솔란케가 10~15골을 넣을 수 있다고 믿는다고 말했습니다. 데 제르비 감독은 "그는 본머스에서 이미 득점했고, 토트넘에서 못 넣을 이유가 무엇이냐"며 솔란케를 다시 최고의 모습으로 되돌리겠다고 했습니다. 토트넘은 리그 4경기째 무득점이며, 데 제르비 감독은 선수들에게 과제를 내주고 맥주를 사주는 방식도 활용하고 있는 것으로 전해졌습니다.',
        },
      ],
    },
  ],
}

function draft(id: string, content: unknown, ageHours = 0): DraftRow {
  return {
    id,
    updated_at: new Date().toISOString(),
    status: "drafted",
    urls: null,
    draft: { title: `기사 ${id}`, content },
    entities: null,
    tags: null,
    decision: null,
    created_at: new Date(Date.now() - ageHours * 3600 * 1000).toISOString(),
  }
}

async function call() {
  const { GET } = await import("@/app/api/cron/news-auto-publish/route")
  const { NextRequest } = await import("next/server")
  return GET(
    new NextRequest("http://localhost/api/cron/news-auto-publish", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  )
}

describe("GET /api/cron/news-auto-publish", () => {
  it.each(["published", "edited"])(
    "does not overwrite a %s draft or emit rejected when the stale-article check races",
    async (change) => {
      drafts = [draft("stale-race", visualDoc)]
      drafts[0].urls = { source: "https://example.com/2020/01/01/story" }
      beforeStaleUpdate = (current) => {
        if (change === "published") current.status = "published"
        else {
          current.updated_at = new Date(Date.parse(current.updated_at) + 1000).toISOString()
          current.draft = { ...current.draft, title: "새로 데스킹한 제목" }
        }
      }
      const result = await (await call()).json()
      expect(result.skipCounts.draft_changed).toBe(1)
      expect(reservoirUpdates).toHaveLength(0)
      expect(ledgerEvents.some((event) => event.to_state === "rejected")).toBe(false)
      expect(drafts[0].status).toBe(change === "published" ? "published" : "drafted")
      if (change === "edited") expect(drafts[0].draft.title).toBe("새로 데스킹한 제목")
    }
  )
  it("records stale-article rejection only after the conditional write succeeds", async () => {
    drafts = [draft("stale-success", visualDoc)]
    drafts[0].urls = { source: "https://example.com/2020/01/01/story" }
    const result = await (await call()).json()
    expect(result.skipCounts.stale_article).toBe(1)
    expect(drafts[0].status).toBe("rejected")
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "rejected",
      reason_code: "stale_article",
    })
  })
  it("does not record a successful stale-article rejection after a database failure", async () => {
    drafts = [draft("stale-error", visualDoc)]
    drafts[0].urls = { source: "https://example.com/2020/01/01/story" }
    staleWriteError = { message: "write timeout" }
    const result = await (await call()).json()
    expect(result.ok).toBe(false)
    expect(drafts[0].status).toBe("drafted")
    expect(reservoirUpdates).toHaveLength(0)
    expect(ledgerEvents.some((event) => event.to_state === "rejected")).toBe(false)
  })
  it("keeps a concurrent source duplicate as duplicate instead of overwriting its ledger state with retry_wait", async () => {
    drafts = [draft("racing-duplicate", visualDoc)]
    atomicOutcome = "duplicate"
    const result = await (await call()).json()
    expect(result).toMatchObject({ ok: true, published: 0 })
    expect(result.gated).toEqual(["racing-duplicate: URL 중복"])
    expect(inserted).toHaveLength(0)
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "duplicate",
      reason_code: "same_source_url_blocked",
    })
  })
  it("does not count an already-committed publication twice and repairs the published ledger state", async () => {
    drafts = [draft("retry-committed", visualDoc)]
    atomicOutcome = "already_published"
    const result = await (await call()).json()
    expect(result).toMatchObject({
      ok: true,
      published: 0,
      postIds: [],
      skipCounts: { already_published: 1 },
    })
    expect(inserted).toHaveLength(0)
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "published",
      reason_code: "post_publish_recovered",
    })
  })
  it("does not inspect, publish or reject drafts when the recent-post duplicate lookup fails", async () => {
    drafts = [draft("lookup-error", visualDoc)]
    recentPostsError = { message: "database timeout" }
    const { inspectDraft } = await import("@/lib/news/quality-gate")
    vi.mocked(inspectDraft).mockClear()
    const response = await call()
    expect(response.status).toBe(503)
    expect(inserted).toHaveLength(0)
    expect(reservoirUpdates).toHaveLength(0)
    expect(inspectDraft).not.toHaveBeenCalled()
  })
  it.each(["new_information", "duplicate", "unavailable"])(
    "compares similar titles using source-backed followup evidence: %s",
    async (verdict) => {
      drafts = [draft("followup", visualDoc)]
      drafts[0].raw = {
        source_text: "A newly reported answer from the post-match press conference.",
      }
      recentPostRows = [
        {
          title: "Earlier match report",
          source_url: "https://example.com/earlier",
          content: visualDoc,
        },
      ]
      titleSimilarityMock.mockReturnValue(0.7)
      followupMock.mockResolvedValue(verdict)
      const body = await (await call()).json()
      expect(followupMock).toHaveBeenCalledWith(
        expect.any(String),
        visualDoc,
        drafts[0].raw.source_text,
        [recentPostRows[0]]
      )
      expect(body.published).toBe(verdict === "new_information" ? 1 : 0)
      if (verdict === "unavailable") {
        expect(reservoirUpdates).toHaveLength(0)
        expect(ledgerEvents.at(-1)).toMatchObject({
          to_state: "retry_wait",
          reason_code: "followup_check_unavailable",
        })
      }
      if (verdict === "duplicate") {
        expect(reservoirUpdates[0].patch.decision).toMatchObject({ auto_gate: { pass: false } })
      }
    }
  )

  it("retries legacy inspector outages without bypassing content inspection", async () => {
    drafts = [draft("legacy-infra", visualDoc)]
    drafts[0].decision = {
      auto_gate: { pass: false, reasons: ["검사관 호출 실패(타임아웃/파싱)"] },
    }
    const body = await (await call()).json()
    expect(body.published).toBe(1)
  })

  it("records a bounded retry instead of permanently rejecting an unavailable inspector", async () => {
    drafts = [draft("infra", visualDoc)]
    const { inspectDraft } = await import("@/lib/news/quality-gate")
    vi.mocked(inspectDraft).mockResolvedValueOnce({
      pass: false,
      infra: true,
      reasons: ["검사관 호출 실패(HTTP 503)"],
      playerNamesKr: [],
      coachNamesKr: [],
    })
    const body = await (await call()).json()
    expect(body.published).toBe(0)
    const patch = reservoirUpdates.find((u) => u.id === "infra")!.patch
    expect(patch.decision).toMatchObject({ quality_retry: { attempts: 1 } })
    expect(patch.decision).not.toHaveProperty("auto_gate")
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "retry_wait",
      reason_code: "quality_check_unavailable",
    })
  })

  it("does not call the inspector during backoff or after the retry limit", async () => {
    drafts = [draft("waiting", visualDoc), draft("exhausted", visualDoc)]
    drafts[0].decision = {
      quality_retry: { attempts: 1, next_at: new Date(Date.now() + 3600000).toISOString() },
    }
    drafts[1].decision = { quality_retry: { attempts: 4 } }
    const { inspectDraft } = await import("@/lib/news/quality-gate")
    vi.mocked(inspectDraft).mockClear()
    expect((await (await call()).json()).published).toBe(0)
    expect(inspectDraft).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    titleSimilarityMock.mockReset().mockReturnValue(0)
    followupMock.mockReset().mockResolvedValue("unavailable")
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    // 2026-07-30 opt-in 전환 — 발행 동작 테스트는 명시적으로 켠다
    process.env.NEWS_AUTO_PUBLISH = "on"
    publishingSettingsMock.mockReset().mockImplementation(async () => ({
      publish_enabled: null,
      effective_enabled: process.env.NEWS_AUTO_PUBLISH === "on",
      per_run_cap: 2,
    }))
    editorialRulesMock.mockReset().mockResolvedValue([])
    drafts = []
    botPublishedToday = 0
    autoPublishedToday = 0
    recentPostRows = []
    recentPostsError = null
    atomicOutcome = "published"
    beforeStaleUpdate = null
    staleWriteError = null
    knownCandidates = []
    inserted.length = 0
    reservoirUpdates.length = 0
    ledgerEvents.length = 0
    inspectImageMock.mockReset().mockResolvedValue({ pass: true, reason: "ok" })
    rehostMock.mockReset().mockImplementation(async (src: string) => src)
  })

  it.each([undefined, currentGuidance])(
    "holds the reported Solanke copy even with current guidance: %j",
    async (guidance) => {
      editorialRulesMock.mockResolvedValue(currentRules)
      drafts = [draft("hermes-reddit-1wgwzfy", solankeDoc, 9)]
      drafts[0].raw = { editorial_guidance: guidance }
      const { inspectDraft } = await import("@/lib/news/quality-gate")
      vi.mocked(inspectDraft).mockClear()
      const body = await (await call()).json()
      expect(body.published).toBe(0)
      expect(body.skipCounts.editorial_style_violation).toBe(1)
      expect(inserted).toHaveLength(0)
      expect(reservoirUpdates).toHaveLength(0)
      expect(inspectDraft).not.toHaveBeenCalled()
      expect(ledgerEvents.at(-1)).toMatchObject({
        to_state: "needs_human",
        reason_code: "editorial_style_violation",
      })
    }
  )

  it.each([
    undefined,
    { ...currentGuidance, applied_rule_ids: [] },
    { ...currentGuidance, policy_version: "2026-09-15.1" },
    { ...currentGuidance, loaded_at: "2026-09-15T11:06:00.000Z" },
  ])(
    "holds an old draft until current rules are used, even when its wording passes: %j",
    async (guidance) => {
      editorialRulesMock.mockResolvedValue(currentRules)
      drafts = [draft("old-copy", visualDoc, 9)]
      drafts[0].raw = { editorial_guidance: guidance }
      const body = await (await call()).json()
      expect(body.published).toBe(0)
      expect(body.skipCounts.editorial_rules_stale).toBe(1)
      expect(inserted).toHaveLength(0)
      expect(reservoirUpdates).toHaveLength(0)
    }
  )

  it("publishes current compliant copy through the existing quality checks", async () => {
    editorialRulesMock.mockResolvedValue(currentRules)
    drafts = [draft("current-copy", visualDoc)]
    drafts[0].raw = { editorial_guidance: currentGuidance }
    const body = await (await call()).json()
    expect(body.published).toBe(1)
    expect(inserted).toHaveLength(1)
    expect(editorialRulesMock).toHaveBeenCalledTimes(2)
  })

  it("rechecks rules changed during inspection before inserting the post", async () => {
    editorialRulesMock
      .mockResolvedValueOnce(currentRules)
      .mockResolvedValue(
        currentRules.map((rule) => ({ ...rule, updated_at: "2026-09-15T20:16:00.000Z" }))
      )
    drafts = [draft("changed-rules", visualDoc)]
    drafts[0].raw = { editorial_guidance: currentGuidance }
    const body = await (await call()).json()
    expect(body.published).toBe(0)
    expect(body.skipCounts.editorial_rules_stale).toBe(1)
    expect(inserted).toHaveLength(0)
    expect(reservoirUpdates).toHaveLength(0)
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "needs_human",
      reason_code: "editorial_rules_stale",
    })
  })

  it("fails closed when current editorial rules cannot be loaded", async () => {
    editorialRulesMock.mockRejectedValue(Error("rules unavailable"))
    drafts = [draft("rules-unavailable", visualDoc)]
    expect((await call()).status).toBe(503)
    expect(inserted).toHaveLength(0)
  })

  it("retries a final rule lookup failure without publishing or rejecting the draft", async () => {
    editorialRulesMock
      .mockResolvedValueOnce(currentRules)
      .mockRejectedValue(Error("rules unavailable"))
    drafts = [draft("final-rules-unavailable", visualDoc)]
    drafts[0].raw = { editorial_guidance: currentGuidance }
    const body = await (await call()).json()
    expect(body.published).toBe(0)
    expect(body.skipCounts.editorial_rules_unavailable).toBe(1)
    expect(inserted).toHaveLength(0)
    expect(reservoirUpdates).toHaveLength(0)
    expect(ledgerEvents.at(-1)).toMatchObject({
      to_state: "retry_wait",
      reason_code: "editorial_rules_unavailable",
    })
  })

  it("blocks the reported copy at the common publisher even if the cron precheck is bypassed", async () => {
    editorialRulesMock.mockResolvedValue(currentRules)
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const { publishNewsDraft } = await import("@/lib/news/publish")
    const result = await publishNewsDraft(
      createServiceRoleClient(),
      {
        ...draft("direct-auto", solankeDoc),
        raw: { editorial_guidance: currentGuidance },
      },
      {
        title: '[더 타임스] 데 제르비 "솔란케, 10~15골 넣을 수 있다"',
        content: solankeDoc,
        auto: true,
      }
    )
    expect(result.editorialHold?.reasonCode).toBe("editorial_style_violation")
    expect(result.postId).toBeUndefined()
    expect(inserted).toHaveLength(0)
    expect(reservoirUpdates).toHaveLength(0)
  })

  it("실제 이미지가 있는 초안만 발행하고 auto=true 로 표시한다", async () => {
    drafts = [draft("a", visualDoc), draft("b", textOnlyDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    expect(body.observability).toBe("ok")
    expect(inserted).toHaveLength(1)
    const patch = reservoirUpdates.find((u) => u.id === "a")?.patch as {
      status: string
      publish: { auto?: boolean }
    }
    expect(patch.status).toBe("published")
    expect(patch.publish.auto).toBe(true)
    // 텍스트만인 b 는 건드리지 않는다 — drafted 로 남아 사람 검수 대상
    expect(reservoirUpdates.find((u) => u.id === "b")).toBeUndefined()
  })

  it("회당 상한(2건)을 지킨다", async () => {
    drafts = [draft("a", visualDoc), draft("b", visualDoc), draft("c", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(2)
  })

  it("기발행 수량과 무관하게 회당 상한 2건만 적용한다", async () => {
    botPublishedToday = 50
    autoPublishedToday = 40
    drafts = [draft("a", visualDoc), draft("b", visualDoc), draft("c", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(2)
    expect(inserted).toHaveLength(2)
  })

  it("기본값은 정지 — env NEWS_AUTO_PUBLISH=on 없이는 발행하지 않는다 (opt-in)", async () => {
    delete process.env.NEWS_AUTO_PUBLISH
    drafts = [draft("a", visualDoc)]

    const body = await (await call()).json()

    expect(body.skipped).toContain("정지")
    expect(inserted).toHaveLength(0)
  })

  it("honors an explicit admin pause even when the environment is enabled", async () => {
    publishingSettingsMock.mockResolvedValue({ effective_enabled: false, per_run_cap: 2 })
    drafts = [draft("paused", visualDoc)]
    expect((await (await call()).json()).skipped).toContain("정지")
    expect(inserted).toHaveLength(0)
    expect(ledgerEvents).toHaveLength(0)
  })

  it("fails closed when publishing settings cannot be read", async () => {
    publishingSettingsMock.mockRejectedValue(Error("settings unavailable"))
    drafts = [draft("blocked", visualDoc)]
    expect((await call()).status).toBe(503)
    expect(inserted).toHaveLength(0)
  })

  it("applies the admin cap and rechecks a pause before publishing inspected content", async () => {
    publishingSettingsMock.mockResolvedValue({ effective_enabled: true, per_run_cap: 1 })
    drafts = [draft("first", visualDoc), draft("second", visualDoc)]
    expect((await (await call()).json()).published).toBe(1)
    expect(inserted).toHaveLength(1)

    inserted.length = 0
    publishingSettingsMock
      .mockReset()
      .mockResolvedValueOnce({ effective_enabled: true, per_run_cap: 2 })
      .mockResolvedValue({ effective_enabled: false, per_run_cap: 2 })
    expect((await (await call()).json()).published).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it("holds inspected content when the final settings refresh fails", async () => {
    publishingSettingsMock
      .mockResolvedValueOnce({ effective_enabled: true, per_run_cap: 2 })
      .mockRejectedValueOnce(Error("settings unavailable"))
    drafts = [draft("refresh-failed", visualDoc)]
    const body = await (await call()).json()
    expect(body.published).toBe(0)
    expect(body.ok).toBe(false)
    expect(body.errors).toContain("자동발행 설정 조회 실패")
    expect(inserted).toHaveLength(0)
  })

  // 2026-08-11 정책 변경: 이미지 없는 초안은 **구단 카드를 붙여 발행**한다.
  // 이전(2026-07-30)엔 no_image 로 사람 검수에 넘겼는데, 그 규칙이 있던 이유가
  // "피드 카드에 썸네일이 없다"였다. 구단 카드 21종이 생겨 그 이유가 사라졌다.
  it("이미지가 없으면 구단 카드를 붙여 발행한다 (임베드만 있는 초안 포함)", async () => {
    const embedOnlyDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: LONG_BODY }] },
        { type: "embed", attrs: { provider: "x", url: "https://x.com/a/status/1" } },
      ],
    }
    drafts = [draft("a", embedOnlyDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    expect(body.skipCounts?.no_image).toBeUndefined()
    // LONG_BODY 는 아스날 경기 기사라 아스날 카드가 붙어야 한다 (본문에서 팀을 뽑는다)
    expect(inserted[0]?.image).toBe("/images/news-team/epl_arsenal.webp")
  })

  it("무내용 초안(80자 미만·자기지시 필러)은 이미지가 있어도 발행하지 않는다 (2026-07-30)", async () => {
    const contentFreeDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "FIFA가 새로운 월드컵 스핀오프의 출시를 가속화할 계획이라고 보도되었습니다. 이와 관련된 세부 사항은 기사에서 확인할 수 있습니다. 관계자들은 이번 계획이 향후 일정에 영향을 줄 것으로 보고 있습니다.",
            },
          ],
        },
        { type: "image", attrs: { src: "https://example.com/a.jpg" } },
      ],
    }
    drafts = [draft("a", contentFreeDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(body.skipCounts.content_free).toBe(1)
  })

  it("발행에 성공하면 원장의 마지막 전이가 published 다 (검사 시작이 뒤늦게 덮지 않는다)", async () => {
    // 2026-08-05 실측 회귀: quality_gate_started 를 회차 끝 배치로 밀면
    // publishNewsDraft 가 먼저 flush 한 published 를 덮어써서, 발행된 후보가
    // fact_checking 으로 남았다 (8건).
    drafts = [draft("a", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    const trail = ledgerEvents.filter((e) => e.candidate_id === "a").map((e) => e.to_state)
    expect(trail).toEqual(["fact_checking", "published"])
  })

  // ⚠️ 재료가 no_image → content_free 로 바뀌었다 (2026-08-11). 이미지 없는 초안은 이제
  //    구단 카드를 달고 나가므로 no_image 판정 자체가 발생하지 않는다. 이 두 테스트가
  //    검증하는 건 사유가 아니라 **원장 중복 차단**이라 재료만 갈아끼운다.
  it("판정이 그대로인 정체 후보는 원장에 다시 기록하지 않는다 (이벤트 증폭 차단)", async () => {
    drafts = [draft("a", textOnlyDoc)]
    knownCandidates = [{ candidate_id: "a", state: "held", last_reason_code: "content_free" }]

    const body = await (await call()).json()

    // 회차별 집계는 유지 — 정체 규모를 운영자가 계속 본다
    expect(body.skipCounts.content_free).toBe(1)
    expect(body.repeatedVerdicts).toBe(1)
    expect(ledgerEvents.filter((e) => e.candidate_id === "a")).toHaveLength(0)
  })

  it("판정이 바뀐 후보는 정상적으로 새 전이를 남긴다", async () => {
    drafts = [draft("a", textOnlyDoc)]
    knownCandidates = [{ candidate_id: "a", state: "drafted", last_reason_code: "draft_created" }]

    const body = await (await call()).json()

    expect(body.repeatedVerdicts).toBeUndefined()
    expect(ledgerEvents.filter((e) => e.candidate_id === "a")).toEqual([
      expect.objectContaining({ to_state: "held", reason_code: "content_free" }),
    ])
  })

  it("이미지 검사 인프라 실패는 재호스팅 사본으로 재검사해 발행한다 (가디언 400 실사고)", async () => {
    drafts = [draft("a", visualDoc)]
    // 원본 URL 검사는 400(인프라), 재호스팅 사본 검사는 통과
    inspectImageMock
      .mockResolvedValueOnce({ pass: false, reason: "이미지 검사 실패(HTTP 400)", infra: true })
      .mockResolvedValueOnce({ pass: true, reason: "ok" })
    rehostMock.mockResolvedValue("/storage/posts/bot/rehosted.webp")

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    expect(rehostMock).toHaveBeenCalledWith("https://example.com/a.jpg", expect.any(String))
    // 두 번째 검사는 사본 URL 로
    expect(inspectImageMock).toHaveBeenLastCalledWith(
      "https://gongnori.fan/storage/posts/bot/rehosted.webp"
    )
  })

  it("사본 검사까지 불가하면 '부적합' 낙인 없이 다음 회차로 미룬다 (판정≠실패)", async () => {
    drafts = [draft("a", visualDoc)]
    inspectImageMock.mockResolvedValue({
      pass: false,
      reason: "이미지 검사 실패(HTTP 400)",
      infra: true,
    })
    rehostMock.mockRejectedValue(new Error("download blocked"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(body.skipCounts.image_check_unavailable).toBe(1)
    // 반려 기록(auto_gate)을 찍지 않는다 — 찍으면 사람 검수 무덤으로 떨어져 만료된다
    expect(reservoirUpdates).toHaveLength(0)
    expect(ledgerEvents).toContainEqual(
      expect.objectContaining({
        candidate_id: "a",
        to_state: "retry_wait",
        reason_code: "image_check_unavailable",
      })
    )
    // 종착이 needs_human 이 아니다 — 검사 시작(fact_checking) 후 재시도 대기로만 남는다
    expect(ledgerEvents.map((e) => e.to_state)).toEqual(["fact_checking", "retry_wait"])
    errorSpy.mockRestore()
  })

  it("진짜 부적합 판정(infra 아님)은 기존대로 반려 기록을 남긴다", async () => {
    drafts = [draft("a", visualDoc)]
    inspectImageMock.mockResolvedValue({ pass: false, reason: "로고만 있는 카드" })

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(rehostMock).not.toHaveBeenCalled()
    const gatePatch = reservoirUpdates.find((u) => u.id === "a")?.patch as {
      decision?: { auto_gate?: { reasons?: string[] } }
    }
    expect(gatePatch?.decision?.auto_gate?.reasons).toEqual(["이미지 부적합: 로고만 있는 카드"])
  })

  it("같은 원문 URL 은 제목이 달라도 중복 차단한다 (2026-08-06 가디언 이중 발행 실사고)", async () => {
    recentPostRows = [
      {
        title: "[The Guardian] 비니시우스, 무리뉴 감독과의 훈련 소감",
        source_url: "https://www.theguardian.com/football/2026/aug/04/arsenal-target-vinicius",
      },
    ]
    drafts = [
      {
        ...draft("a", visualDoc),
        // 제목은 전혀 다르게, URL 은 www/쿼리만 다르게 — 정규화가 잡아야 한다
        urls: {
          source:
            "https://theguardian.com/football/2026/aug/04/arsenal-target-vinicius?utm_source=x",
        },
        draft: { title: "완전히 다른 표현의 제목입니다", content: visualDoc },
      },
    ]

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(inserted).toHaveLength(0)
    const patch = reservoirUpdates.find((u) => u.id === "a")?.patch as {
      decision: { auto_gate: { reasons: string[] } }
    }
    expect(patch.decision.auto_gate.reasons[0]).toContain("동일 원문 URL")
    expect(ledgerEvents).toContainEqual(
      expect.objectContaining({
        candidate_id: "a",
        to_state: "duplicate",
        reason_code: "same_source_url",
      })
    )
  })

  it("같은 run 안에서 같은 URL 두 초안이면 첫 건만 발행한다", async () => {
    const url = "https://www.theguardian.com/football/2026/aug/04/same-article"
    /**
     * ⚠️ 나이를 **명시**한다. 큐는 만료 임박군 밖에서 최신순이므로 "첫 건"은 더 새 쪽이다.
     *    둘 다 `ageHours` 를 생략하면 각자 호출 시점의 `Date.now()` 를 쓰는데, 그 사이에
     *    밀리초가 넘어가면 b 가 1ms 더 최신이 되어 **순서가 뒤집힌다** — a 가 중복 판정을
     *    받고 이 단언이 깨진다. CI 를 빨갛게 만들던 깜빡임의 정체였다 (2026-08-26).
     *    제품이 아니라 시험이 순서를 가정만 하고 고정하지 않은 것이다.
     */
    drafts = [
      { ...draft("a", visualDoc, 0), urls: { source: url } },
      {
        ...draft("b", visualDoc, 1),
        urls: { source: url },
        draft: { title: "표현을 바꿔 쓴 같은 기사", content: visualDoc },
      },
    ]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    expect(inserted).toHaveLength(1)
    expect(ledgerEvents).toContainEqual(
      expect.objectContaining({
        candidate_id: "b",
        to_state: "duplicate",
        reason_code: "same_source_url",
      })
    )
  })

  it("만료 임박 초안을 신선한 초안보다 먼저 발행한다 (스타베이션 차단)", async () => {
    // 2026-08-05 실측: 만료된 30건 전부가 자동발행에게 한 번도 스캔되지 않았다.
    // 최신순으로만 훑으면 회당 상한에서 끊겨 오래된 것이 매번 밀리다 죽는다.
    drafts = [
      draft("fresh1", visualDoc, 0),
      draft("fresh2", visualDoc, 1),
      draft("expiring", visualDoc, 22), // 만료(24h)까지 2시간
    ]

    const body = await (await call()).json()

    expect(body.published).toBe(2)
    const publishedIds = reservoirUpdates
      .filter((u) => (u.patch as { status?: string }).status === "published")
      .map((u) => u.id)
    expect(publishedIds).toContain("expiring")
    // 가장 신선한 것도 함께 나간다 — 임박분 우선이 곧 FIFO 는 아니다
    expect(publishedIds).toContain("fresh1")
    expect(publishedIds).not.toContain("fresh2")
  })

  it("임박분이 없으면 기존대로 최신 우선을 지킨다 (뉴스 신선도)", async () => {
    drafts = [draft("newest", visualDoc, 0), draft("older", visualDoc, 6)]

    await call()

    const order = reservoirUpdates
      .filter((u) => (u.patch as { status?: string }).status === "published")
      .map((u) => u.id)
    expect(order[0]).toBe("newest")
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/news-auto-publish/route")
    const { NextRequest } = await import("next/server")
    const res = await GET(new NextRequest("http://localhost/api/cron/news-auto-publish"))
    expect(res.status).toBe(401)
  })
})
