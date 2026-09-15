import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import type { DeskResearch, DeskSource } from "@/lib/news/desk/types"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  after: vi.fn(),
  run: vi.fn(),
  settings: vi.fn(),
  corrections: vi.fn(),
}))
vi.mock("next/server", async () => ({
  ...(await vi.importActual("next/server")),
  after: mocks.after,
}))
vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApi: mocks.auth }))
vi.mock("@/lib/news/training/jobs", () => ({ runTrainingJob: mocks.run }))
vi.mock("@/lib/news/training/settings", () => ({ loadPublishingSettings: mocks.settings }))
vi.mock("@/data/agents/core/agg-corrections.mjs", () => ({ loadAggCorrections: mocks.corrections }))

const id = "11111111-1111-4111-8111-111111111111"
const source: DeskSource = {
  id: "source",
  source_name: "BBC",
  source_url: "https://bbc.com/sport/football/story",
  title: "Clubs are in talks",
  published_at: "2026-09-15T06:00:00.000Z",
  updated_at: null,
  author: null,
  source_tier: 2,
  primary_or_secondary: "secondary",
  original_reporting: true,
  origin_group: null,
  role: "current",
  captured_at: "2026-09-15T06:10:00.000Z",
  text: "The clubs are negotiating a transfer. No agreement has been reached and the player remains with his current club.",
}
const research: DeskResearch = {
  rejected: false,
  rejection_reason: null,
  news_type: "RUMOR",
  angle: "협상 단계",
  facts: [
    {
      id: "f1",
      text: "두 구단이 협상 중이다.",
      kind: "REPORTED",
      evidence: [{ source_id: "source", quote: "The clubs are negotiating a transfer." }],
    },
  ],
  conflicts: [],
  verification_gaps: [],
}
const db = { rpc: mocks.rpc, from: mocks.from }
const review = {
  baseline_errors: ["certainty"],
  learned_errors: [],
  preference: "learned",
  note: "협상과 확정을 구분했다.",
}
const settings = {
  action: "settings",
  version: 4,
  publish_enabled: false,
  per_run_cap: 2,
  daily_job_limit: 24,
}
const req = (data: unknown) =>
  new NextRequest("https://gongnori.fan/api/admin/news-training", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  })

function query(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "update", "eq", "in", "not", "order", "limit"])
    chain[method] = vi.fn(() => chain)
  chain.single = vi.fn(async () => result)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = vi.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  )
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("OPENAI_API_KEY", "test-key")
  mocks.auth.mockResolvedValue({ userId: "admin-id", supabase: db })
  mocks.rpc.mockResolvedValue({ data: id, error: null })
  mocks.from.mockImplementation(() => query([]))
  mocks.settings.mockResolvedValue({ publish_enabled: false, effective_enabled: false })
  mocks.corrections.mockResolvedValue({ pairs: [{ id: "correction-id" }], rejects: [] })
})

describe("admin training access and mutations", () => {
  it.each([401, 403])(
    "blocks %s before accessing private history or scheduling AI",
    async (status) => {
      mocks.auth.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
      const { GET, POST } = await import("@/app/api/admin/news-training/route")
      expect((await GET()).status).toBe(status)
      expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(status)
      expect(mocks.from).not.toHaveBeenCalled()
      expect(mocks.rpc).not.toHaveBeenCalled()
      expect(mocks.after).not.toHaveBeenCalled()
    }
  )

  it("serves private state without caching and surfaces unavailable storage", async () => {
    const { GET } = await import("@/app/api/admin/news-training/route")
    const response = await GET()
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      correctionIds: ["correction-id"],
      modelReady: true,
      summary: { count: 0 },
    })
    mocks.from.mockImplementation(() => query(null, { message: "missing migration" }))
    expect((await GET()).status).toBe(503)
  })

  it("offers source-backed imports for evaluation without exposing source text in the item selector", async () => {
    const draft = { title: "이미 작성한 기사", article: "연습용 복사본" }
    mocks.from.mockImplementation((table) =>
      query(
        table === "news_desk_items"
          ? [
              { id: "imported", draft, status: "drafted", sources: [source], research: null },
              { id: "researched", draft, status: "reviewed", sources: [source], research },
              { id: "missing", draft, status: "drafted", sources: [], research: null },
              {
                id: "rejected",
                draft,
                status: "drafted",
                sources: [source],
                research: { ...research, rejected: true },
              },
              {
                id: "background-only",
                draft,
                status: "drafted",
                sources: [{ ...source, role: "background" }],
                research: null,
              },
            ]
          : []
      )
    )
    const { GET } = await import("@/app/api/admin/news-training/route")
    expect(await (await GET()).json()).toMatchObject({
      items: [
        { id: "imported", draft, status: "drafted", needs_research: true },
        { id: "researched", draft, status: "reviewed", needs_research: false },
      ],
    })
    const items = (await (await GET()).json()).items
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item).not.toHaveProperty("sources")
      expect(item).not.toHaveProperty("research")
    }
  })

  it("rejects stale settings and rules without reserving generation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } })
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req(settings))).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledWith("save_news_training_setting", {
      p_version: 4,
      p_enabled: false,
      p_cap: 2,
      p_limit: 24,
      p_actor: "admin-id",
    })
    expect(
      (
        await POST(
          req({
            action: "rule",
            rule: {
              id,
              version: 3,
              title: "확신 수준",
              instruction: "협상 중인 사안은 확정으로 표현하지 않는다.",
              category: "certainty",
              priority: 90,
              active: true,
            },
          })
        )
      ).status
    ).toBe(409)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it.each([
    { ...settings, per_run_cap: 0 },
    { ...settings, daily_job_limit: 49 },
    { action: "review", id, version: -1, review },
    {
      action: "review",
      id,
      version: 0,
      review: { ...review, learned_errors: ["invented-category"] },
    },
  ])("rejects malformed mutations before DB access: %j", async (body) => {
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req(body))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("records a review only for the completed evaluation and expected version", async () => {
    const chain = query({ id })
    mocks.from.mockReturnValue(chain)
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req({ action: "review", id, version: 2, review }))).status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ review: { ...review, reviewer: "admin-id" }, review_version: 3 })
    )
    expect(chain.eq.mock.calls).toEqual([
      ["id", id],
      ["kind", "news_evaluation"],
      ["status", "completed"],
      ["review_version", 2],
    ])
    mocks.from.mockReturnValue(query(null))
    expect((await POST(req({ action: "review", id, version: 2, review }))).status).toBe(409)
  })

  it("requires the lesson timestamp so an old tab cannot replace its priority", async () => {
    const chain = query(null)
    mocks.from.mockReturnValue(chain)
    const { POST } = await import("@/app/api/admin/news-training/route")
    const expected = "2026-09-15T06:00:00.000Z"
    expect(
      (await POST(req({ action: "lesson_priority", id, expected, priority: 100 }))).status
    ).toBe(409)
    expect(chain.eq).toHaveBeenCalledWith("updated_at", expected)
  })

  it("checks model readiness and researched evidence before charging a job slot", async () => {
    const { POST } = await import("@/app/api/admin/news-training/route")
    vi.stubEnv("OPENAI_API_KEY", "")
    expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(503)
    vi.stubEnv("OPENAI_API_KEY", "test-key")
    mocks.from.mockReturnValue(query({ id, research: { rejected: true }, status: "drafted" }))
    expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it("reserves a private evaluation before scheduling the worker", async () => {
    const item = {
      id,
      sources: [source],
      research,
      status: "reviewed",
    }
    mocks.from.mockReturnValue(query(item))
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(202)
    expect(mocks.rpc).toHaveBeenCalledWith("enqueue_admin_training", {
      p_kind: "news_evaluation",
      p_payload: { item_id: id, sources: item.sources, research: item.research },
      p_actor: "admin-id",
    })
    expect(mocks.run).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.run).toHaveBeenCalledWith(db, id)
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.after.mock.invocationCallOrder[0]
    )
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["news_desk_items"])
  })

  it("queues source-backed imports before their first research extraction", async () => {
    mocks.from.mockReturnValue(query({ id, sources: [source], research: null, status: "drafted" }))
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(202)
    expect(mocks.rpc).toHaveBeenCalledWith("enqueue_admin_training", {
      p_kind: "news_evaluation",
      p_payload: { item_id: id, sources: [source], research: null },
      p_actor: "admin-id",
    })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it.each([
    { sources: [] },
    { sources: [{ ...source, role: "background" }] },
    { sources: [{ ...source, text: "too short" }] },
  ])("rejects source-less or malformed imports before reserving a job: %j", async ({ sources }) => {
    mocks.from.mockReturnValue(query({ id, sources, research: null, status: "drafted" }))
    const { POST } = await import("@/app/api/admin/news-training/route")
    expect((await POST(req({ action: "evaluate", item_id: id }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it("retries failed jobs through the same quota reservation and rejects active jobs", async () => {
    const { POST } = await import("@/app/api/admin/news-training/route")
    for (const status of ["queued", "running", "completed"]) {
      mocks.from.mockReturnValue(
        query({ kind: "agg_generation", status, payload: { source_title: "소재" } })
      )
      expect((await POST(req({ action: "retry", id }))).status).toBe(409)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.from.mockReturnValue(
      query({ kind: "agg_generation", status: "failed", payload: { source_title: "소재" } })
    )
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "이미 실행 중입니다." },
    })
    expect((await POST(req({ action: "retry", id }))).status).toBe(409)
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith(
      "enqueue_admin_training",
      expect.objectContaining({ p_kind: "agg_generation", p_actor: "admin-id" })
    )
    mocks.rpc.mockResolvedValue({ data: id, error: null })
    expect((await POST(req({ action: "retry", id }))).status).toBe(202)
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
})
