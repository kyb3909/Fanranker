import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const { inserted } = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[] }))
vi.mock("@/lib/discord-notify", () => ({ notifyDiscordOps: vi.fn() }))
vi.mock("@/lib/news/candidate-ledger", () => ({
  newsCandidateRunId: () => "test-run",
  recordNewsCandidateEvents: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        in: () => ({ gte: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row)
        return { error: null }
      },
    }),
  }),
}))
beforeEach(() => {
  process.env.CRON_SECRET = "news-test-secret"
  inserted.length = 0
})
describe("draft evidence storage", () => {
  it("preserves original title, subreddit, complete source and background together", async () => {
    const { POST } = await import("@/app/api/news/agent-draft/route")
    const sourceUrl = "https://www.chelseafc.com/en/news/article/example"
    const now = new Date().toISOString()
    const evidence = {
      version: 1,
      original_title: "Coach press conference",
      source_url: sourceUrl,
      published_at: now,
      captured_at: now,
      background: [],
      match_ids: [],
    }
    const payload = {
      title: "감독, 경기 후 수비 개선 필요성 설명",
      original_title: evidence.original_title,
      source_url: sourceUrl,
      source_text: "Original complete paragraph.\n".repeat(250),
      subreddit: "chelseafc",
      evidence,
      dedupe_key: "wire:example",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "확인된 경기 후 발언입니다." }] },
        ],
      },
    }
    const response = await POST(
      new NextRequest("https://example.test/api/news/agent-draft", {
        method: "POST",
        headers: { authorization: "Bearer news-test-secret" },
        body: JSON.stringify(payload),
      })
    )
    expect(response.status).toBe(201)
    expect(inserted[0].source).toMatchObject({ subreddit: "chelseafc" })
    expect(inserted[0].raw).toMatchObject({
      original_title: evidence.original_title,
      evidence,
      source_text: payload.source_text,
    })
    expect(inserted[0].status).toBe("drafted")
  })
})
