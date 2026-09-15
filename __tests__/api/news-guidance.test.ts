// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  notation: vi.fn(),
  lessons: vi.fn(),
  rules: vi.fn(),
  insert: vi.fn(),
}))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/news/notation", () => ({ loadNotation: mocks.notation }))
vi.mock("@/lib/news/desk/service", () => ({ loadDeskLessons: mocks.lessons }))
vi.mock("@/lib/news/training/settings", () => ({ loadEditorialRules: mocks.rules }))
vi.mock("@/lib/discord-notify", () => ({ notifyDiscordOps: vi.fn() }))
vi.mock("@/lib/news/candidate-ledger", () => ({
  newsCandidateRunId: () => "test-run",
  recordNewsCandidateEvents: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/tiptap/sanitize", () => ({ sanitizeTipTapJSON: (value: unknown) => value }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockReturnValue(null)
  mocks.notation.mockResolvedValue({ hints: [] })
  mocks.lessons.mockResolvedValue([])
  mocks.rules.mockResolvedValue([])
  const chain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  mocks.from.mockReturnValue(chain)
})

describe("private live guidance API", () => {
  const req = () => new NextRequest("https://example.com/api/news/correction-examples")
  it("requires cron authentication before reading private corrections", async () => {
    const { GET } = await import("@/app/api/news/correction-examples/route")
    mocks.auth.mockReturnValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    expect((await GET(req())).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it("distinguishes no saved guidance from guidance that could not be loaded", async () => {
    const { GET } = await import("@/app/api/news/correction-examples/route")
    const empty = await GET(req())
    expect(empty.status).toBe(200)
    expect(await empty.json()).toMatchObject({
      guidance_available: true,
      lessons: [],
      editorial_rules: [],
      naming: [],
    })
    mocks.rules.mockRejectedValueOnce(Error("private database reason"))
    const failed = await GET(req())
    expect(failed.status).toBe(503)
    const result = await failed.json()
    expect(result.guidance_available).toBe(false)
    expect(result.error).not.toContain("private database reason")
    expect(result).not.toHaveProperty("editorial_rules")
  })
  it("holds writing when the notation dictionary is unavailable", async () => {
    const { GET } = await import("@/app/api/news/correction-examples/route")
    mocks.notation.mockRejectedValueOnce(Error("notation unavailable"))
    expect((await GET(req())).status).toBe(503)
  })
})

describe("live draft guidance provenance", () => {
  const trace = {
    policy_version: "2026-09-15.1",
    loaded_at: "2026-09-15T00:00:00.000Z",
    applied_lesson_ids: ["11111111-1111-4111-8111-111111111111"],
    applied_rule_ids: ["22222222-2222-4222-8222-222222222222"],
  }
  const request = (guidance: unknown) =>
    new NextRequest("https://example.com/api/news/agent-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "구단의 발표",
        content: { type: "doc", content: [] },
        dedupe_key: "test-trace",
        editorial_guidance: guidance,
      }),
    })
  it("preserves guidance IDs in original material and the reviewable draft", async () => {
    mocks.insert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: mocks.insert,
    })
    const { POST } = await import("@/app/api/news/agent-draft/route")
    expect((await POST(request(trace))).status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        raw: expect.objectContaining({ editorial_guidance: trace }),
        draft: expect.objectContaining({ editorial_guidance: trace }),
      })
    )
  })
  it("rejects malformed provenance instead of saving misleading IDs", async () => {
    const { POST } = await import("@/app/api/news/agent-draft/route")
    expect((await POST(request({ ...trace, applied_lesson_ids: ["not-an-id"] }))).status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
