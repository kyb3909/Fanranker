import { beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  load: vi.fn(),
  reserve: vi.fn(),
  generate: vi.fn(),
  learn: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  after: vi.fn(),
}))
vi.mock("next/server", async () => ({
  ...(await vi.importActual("next/server")),
  after: mocks.after,
}))
vi.mock("@/lib/admin/roles", () => ({ requireStaffApi: mocks.auth }))
vi.mock("@/lib/news/desk/service", () => ({
  loadDesk: mocks.load,
  reserveDeskDraft: mocks.reserve,
  generateDeskDraft: mocks.generate,
  learnDeskRevision: mocks.learn,
}))
const id = "11111111-1111-4111-8111-111111111111"
const db = { rpc: mocks.rpc, from: mocks.from }
const body = {
  action: "save",
  id,
  version: 2,
  draft: {
    title: "선수 영입 협상",
    article: "BBC는 두 구단이 선수 이적 협상을 진행하고 있다고 보도했다.",
  },
  reason: "제목의 확신 수준을 낮춤",
  status: "reviewed",
}
const req = (data: unknown) =>
  new NextRequest("https://gongnori.fan/api/admin/news-desk", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: "editor-id", role: "editor", supabase: db })
  mocks.rpc.mockResolvedValue({ data: { version: 3, changed: true, revision_id: id }, error: null })
  mocks.reserve.mockResolvedValue({ id, token: id })
  mocks.load.mockResolvedValue({ items: [] })
})
describe("news desk access and saving", () => {
  it("rejects unauthenticated access before touching private data or paid services", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "로그인 필요" }, { status: 401 }))
    const { GET, POST } = await import("@/app/api/admin/news-desk/route")
    expect((await GET()).status).toBe(401)
    expect((await POST(req(body))).status).toBe(401)
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("lets editors desk articles but restricts budget changes and new generation to admins", async () => {
    const { POST } = await import("@/app/api/admin/news-desk/route")
    expect((await POST(req({ action: "generate" }))).status).toBe(403)
    expect(
      (await POST(req({ action: "settings", enabled: true, pending_target: 20, daily_limit: 48 })))
        .status
    ).toBe(403)
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect((await POST(req(body))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_news_desk_edit",
      expect.objectContaining({
        p_expected_version: 2,
        p_editor: "editor-id",
        p_reason: body.reason,
        p_status: "reviewed",
      })
    )
  })
  it("persists the edit before scheduling learning and never calls a publishing endpoint", async () => {
    const { POST } = await import("@/app/api/admin/news-desk/route")
    const response = await POST(req(body))
    expect(response.headers.get("Cache-Control")).toContain("no-store")
    expect(await response.json()).toMatchObject({ changed: true, version: 3 })
    expect(mocks.learn).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.learn).toHaveBeenCalledWith(db, id)
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.after.mock.invocationCallOrder[0]
    )
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it("reports a version conflict without starting learning", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } })
    const { POST } = await import("@/app/api/admin/news-desk/route")
    expect((await POST(req(body))).status).toBe(409)
    expect(mocks.after).not.toHaveBeenCalled()
  })
  it("does not spend tokens when quota reservation declines the request", async () => {
    mocks.auth.mockResolvedValue({ userId: "owner", role: "admin", supabase: db })
    mocks.reserve.mockResolvedValue({ skipped: "daily_limit" })
    const { POST } = await import("@/app/api/admin/news-desk/route")
    expect(await (await POST(req({ action: "generate" }))).json()).toEqual({
      skipped: "daily_limit",
    })
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it("rejects malformed, oversized, and out-of-range mutations", async () => {
    const { POST } = await import("@/app/api/admin/news-desk/route")
    expect(
      (await POST(req({ ...body, draft: { ...body.draft, article: "x".repeat(32000) } }))).status
    ).toBe(413)
    expect((await POST(req({ ...body, version: -1 }))).status).toBe(400)
    expect((await POST(req({ ...body, status: "published" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("stores the editor's explanation and instruction when explicitly confirming a lesson", async () => {
    const chain = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id }, error: null })),
    }
    for (const method of [chain.update, chain.eq, chain.select]) method.mockReturnValue(chain)
    mocks.from.mockReturnValue(chain)
    const { POST } = await import("@/app/api/admin/news-desk/route")
    const lesson = {
      action: "lesson",
      id,
      active: true,
      expected: "2026-09-15T06:00:00.000Z",
      explanation: "원문은 협상 중인데 제목이 확정으로 단정했다.",
      instruction: "협상·합의·발표 단계를 구분하고 원문보다 강한 확정 표현을 쓰지 않는다.",
    }
    const response = await POST(req(lesson))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ ok: true, updated_at: expect.any(String) })
    expect(mocks.from).toHaveBeenCalledWith("news_desk_lessons")
    expect(chain.update).toHaveBeenCalledWith({
      active: true,
      explanation: lesson.explanation,
      instruction: lesson.instruction,
      review_status: "reviewed",
      updated_at: result.updated_at,
    })
    expect(chain.eq.mock.calls).toEqual([
      ["id", id],
      ["updated_at", lesson.expected],
    ])
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.learn).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a stale lesson confirmation without overwriting a newer interpretation", async () => {
    const chain = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }
    for (const method of [chain.update, chain.eq, chain.select]) method.mockReturnValue(chain)
    mocks.from.mockReturnValue(chain)
    const { POST } = await import("@/app/api/admin/news-desk/route")
    const expected = "2026-09-15T06:00:00.000Z"
    const response = await POST(
      req({
        action: "lesson",
        id,
        active: true,
        expected,
        explanation: "오래된 해석",
        instruction: "오래된 적용 지침",
      })
    )
    expect(response.status).toBe(409)
    expect(chain.eq).toHaveBeenCalledWith("updated_at", expected)
    expect(mocks.learn).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it.each([
    { instruction: "검증 가능한 원문 수준으로 쓴다." },
    { expected: "2026-09-15T06:00:00.000Z" },
    { expected: "2026-09-15T06:00:00.000Z", instruction: "짧음" },
  ])(
    "requires a version timestamp and reusable instruction before confirming learning: %j",
    async (fields) => {
      const { POST } = await import("@/app/api/admin/news-desk/route")
      expect(
        (
          await POST(
            req({
              action: "lesson",
              id,
              active: true,
              explanation: "사용자가 확인한 해석",
              ...fields,
            })
          )
        ).status
      ).toBe(400)
      expect(mocks.from).not.toHaveBeenCalled()
      expect(mocks.after).not.toHaveBeenCalled()
    }
  )
})
