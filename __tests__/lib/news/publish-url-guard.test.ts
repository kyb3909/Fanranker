import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 발행 초크포인트의 "같은 원문 URL = 같은 기사" 최후 방어선.
 * 자동발행 게이트를 우회하는 **사람 검수 발행**까지 포함해, 살아있는 봇 글과 같은
 * 원문이면 발행 자체가 막힌다 (2026-08-06 가디언 이중 발행 실사고).
 */

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>()
  return { ...mod, after: (fn: () => void) => fn() }
})
vi.mock("@/lib/discord/news-notify", () => ({
  notifyNewsPublished: vi.fn().mockResolvedValue(undefined),
  resolveNewsChannel: () => "football",
}))
vi.mock("@/lib/news/learn-corrections", () => ({
  learnFromDeskEdit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/news/suggest-flair", () => ({ suggestFlairs: () => ({ flairIds: [] }) }))
vi.mock("@/lib/images/rehost", () => ({
  isSelfHostedImageUrl: () => true,
  rehostExternalImage: vi.fn(async (src: string) => src),
}))
vi.mock("@/lib/saga/publish", () => ({
  linkArticleToSaga: vi.fn().mockResolvedValue(null),
  linkArticleToSagaChosen: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/news/vs-issue", () => ({ createVsPollFromDraft: vi.fn().mockResolvedValue(null) }))

let recentPostRows: { id: string; title: string; source_url: string | null }[] = []
const inserted: Record<string, unknown>[] = []
const ledgerEvents: { candidate_id: string; to_state: string; reason_code?: string }[] = []

function mockSupabase() {
  return {
    rpc: async (
      _name: string,
      args: { p_events: { candidate_id: string; to_state: string; reason_code?: string }[] }
    ) => {
      ledgerEvents.push(...args.p_events)
      return { data: args.p_events.length, error: null }
    },
    from: (table: string) => {
      if (table === "posts") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({ gte: async () => ({ data: recentPostRows, error: null }) }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row)
            return {
              select: () => ({ single: async () => ({ data: { id: "post_new" }, error: null }) }),
            }
          },
        }
      }
      if (table === "news_reservoir") {
        return { update: () => ({ eq: async () => ({ error: null }) }) }
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
  } as never
}

const doc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }],
}

describe("publishNewsDraft — 원문 URL 최후 방어선", () => {
  beforeEach(() => {
    recentPostRows = []
    inserted.length = 0
    ledgerEvents.length = 0
  })

  it("살아있는 봇 글과 같은 원문이면 발행을 막고 사유를 돌려준다 (검수 발행 포함)", async () => {
    const { publishNewsDraft } = await import("@/lib/news/publish")
    recentPostRows = [
      {
        id: "existing",
        title: "이미 발행된 같은 기사",
        source_url: "https://www.theguardian.com/football/story?utm_source=x",
      },
    ]

    const result = await publishNewsDraft(
      mockSupabase(),
      {
        id: "draft-1",
        urls: { source: "https://theguardian.com/football/story" },
        draft: null,
        entities: null,
        tags: null,
      },
      { title: "제목이 완전히 달라도", content: doc }
    )

    expect(result.error).toContain("동일 원문")
    expect(inserted).toHaveLength(0)
    expect(ledgerEvents).toEqual([
      expect.objectContaining({
        candidate_id: "draft-1",
        to_state: "duplicate",
        reason_code: "same_source_url_blocked",
      }),
    ])
  })

  it("같은 원문이 없으면 정상 발행된다", async () => {
    const { publishNewsDraft } = await import("@/lib/news/publish")
    recentPostRows = [
      { id: "other", title: "다른 기사", source_url: "https://bbc.co.uk/sport/other" },
    ]

    const result = await publishNewsDraft(
      mockSupabase(),
      {
        id: "draft-1",
        urls: { source: "https://theguardian.com/football/story" },
        draft: null,
        entities: null,
        tags: null,
      },
      { title: "새 기사", content: doc }
    )

    expect(result.error).toBeUndefined()
    expect(result.postId).toBe("post_new")
  })

  it("원문 URL 이 없는 초안은 이 방어선을 지나지 않는다", async () => {
    const { publishNewsDraft } = await import("@/lib/news/publish")

    const result = await publishNewsDraft(
      mockSupabase(),
      { id: "draft-1", urls: null, draft: null, entities: null, tags: null },
      { title: "URL 없는 기사", content: doc }
    )

    expect(result.error).toBeUndefined()
    expect(result.postId).toBe("post_new")
  })
})
