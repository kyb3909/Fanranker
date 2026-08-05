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
const inspectImageMock = vi.fn()
vi.mock("@/lib/news/quality-gate", () => ({
  inspectDraft: vi.fn().mockResolvedValue({ pass: true, reasons: [], playerNamesKr: [] }),
  inspectImage: (url: string) => inspectImageMock(url),
  unknownPlayerNames: vi.fn().mockReturnValue([]),
  PERSONAL_BLOG_RE: /substack\.com/i,
  isWomensFootball: (...texts: (string | null | undefined)[]) =>
    /women|여자\s*축구/i.test(texts.filter(Boolean).join(" ")),
}))
vi.mock("@/lib/saga/cluster", () => ({ titleSimilarity: () => 0 }))
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
let recentPostRows: { title: string; source_url: string | null }[] = []
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
                      gte: async () => ({ data: recentPostRows, error: null }),
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

function draft(id: string, content: unknown, ageHours = 0): DraftRow {
  return {
    id,
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
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    // 2026-07-30 opt-in 전환 — 발행 동작 테스트는 명시적으로 켠다
    process.env.NEWS_AUTO_PUBLISH = "on"
    drafts = []
    botPublishedToday = 0
    autoPublishedToday = 0
    recentPostRows = []
    knownCandidates = []
    inserted.length = 0
    reservoirUpdates.length = 0
    ledgerEvents.length = 0
    inspectImageMock.mockReset().mockResolvedValue({ pass: true, reason: "ok" })
    rehostMock.mockReset().mockImplementation(async (src: string) => src)
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
    drafts = [
      { ...draft("a", visualDoc), urls: { source: url } },
      {
        ...draft("b", visualDoc),
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
