import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 뉴스 자동발행 cron — 검수 없이 담벼락에 나가는 유일한 경로.
 * 여기서 잠그는 계약:
 *   · 실제 이미지 없는 초안은 자동으로 나가지 않는다 (사람 검수로만)
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
vi.mock("@/lib/news/quality-gate", () => ({
  inspectDraft: vi.fn().mockResolvedValue({ pass: true, reasons: [], playerNamesKr: [] }),
  inspectImage: vi.fn().mockResolvedValue({ pass: true, reason: "ok" }),
  unknownPlayerNames: vi.fn().mockReturnValue([]),
  PERSONAL_BLOG_RE: /substack\.com/i,
  isWomensFootball: (...texts: (string | null | undefined)[]) =>
    /women|여자\s*축구/i.test(texts.filter(Boolean).join(" ")),
}))
vi.mock("@/lib/saga/cluster", () => ({ titleSimilarity: () => 0 }))
vi.mock("@/lib/images/rehost", () => ({
  isSelfHostedImageUrl: () => true,
  rehostExternalImage: vi.fn(async (src: string) => src),
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
  status: string
  urls: { source?: string | null } | null
  draft: { title?: string; content?: unknown; original?: { title?: string } }
  entities: null
  tags: null
  decision: Record<string, unknown> | null
  created_at: string
}

let drafts: DraftRow[] = []
let botPublishedToday = 0
let autoPublishedToday = 0
let knownCandidates: { candidate_id: string; state: string; last_reason_code: string | null }[] = []
const inserted: Record<string, unknown>[] = []
const reservoirUpdates: Array<{ id: string; patch: Record<string, unknown> }> = []
/** 원장 RPC 로 실제로 흘러간 전이 — 호출 순서대로 평탄화해 순서 계약을 검증한다 */
const ledgerEvents: { candidate_id: string; to_state: string; reason_code?: string }[] = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: async (
      _name: string,
      args: { p_events: { candidate_id: string; to_state: string; reason_code?: string }[] }
    ) => {
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
                      gte: async () => ({ data: [], error: null }),
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
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              reservoirUpdates.push({ id, patch })
              return { error: null }
            },
          }),
        }
      }
      if (table === "news_alias_dictionary") {
        return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
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

function draft(id: string, content: unknown): DraftRow {
  return {
    id,
    status: "drafted",
    urls: null,
    draft: { title: `기사 ${id}`, content },
    entities: null,
    tags: null,
    decision: null,
    created_at: new Date().toISOString(),
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
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    // 2026-07-30 opt-in 전환 — 발행 동작 테스트는 명시적으로 켠다
    process.env.NEWS_AUTO_PUBLISH = "on"
    drafts = []
    botPublishedToday = 0
    autoPublishedToday = 0
    knownCandidates = []
    inserted.length = 0
    reservoirUpdates.length = 0
    ledgerEvents.length = 0
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

  it("임베드만 있고 실제 이미지가 없는 초안은 발행하지 않는다 (2026-07-30 강화)", async () => {
    const embedOnlyDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
        { type: "embed", attrs: { provider: "x", url: "https://x.com/a/status/1" } },
      ],
    }
    drafts = [draft("a", embedOnlyDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(body.skipCounts.no_image).toBe(1)
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

  it("판정이 그대로인 정체 후보는 원장에 다시 기록하지 않는다 (이벤트 증폭 차단)", async () => {
    drafts = [draft("a", textOnlyDoc)]
    knownCandidates = [{ candidate_id: "a", state: "needs_human", last_reason_code: "no_image" }]

    const body = await (await call()).json()

    // 회차별 집계는 유지 — 정체 규모를 운영자가 계속 본다
    expect(body.skipCounts.no_image).toBe(1)
    expect(body.repeatedVerdicts).toBe(1)
    expect(ledgerEvents.filter((e) => e.candidate_id === "a")).toHaveLength(0)
  })

  it("판정이 바뀐 후보는 정상적으로 새 전이를 남긴다", async () => {
    drafts = [draft("a", textOnlyDoc)]
    knownCandidates = [{ candidate_id: "a", state: "drafted", last_reason_code: "draft_created" }]

    const body = await (await call()).json()

    expect(body.repeatedVerdicts).toBeUndefined()
    expect(ledgerEvents.filter((e) => e.candidate_id === "a")).toEqual([
      expect.objectContaining({ to_state: "needs_human", reason_code: "no_image" }),
    ])
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/news-auto-publish/route")
    const { NextRequest } = await import("next/server")
    const res = await GET(new NextRequest("http://localhost/api/cron/news-auto-publish"))
    expect(res.status).toBe(401)
  })
})
