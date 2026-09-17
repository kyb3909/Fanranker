import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), import: vi.fn() }))
vi.mock("@/lib/admin/roles", () => ({ requireStaffApi: mocks.auth }))
vi.mock("@/lib/news/desk/catalog", async () => ({
  ...(await vi.importActual("@/lib/news/desk/catalog")),
  listDeskCatalog: mocks.list,
  openDeskArticle: mocks.import,
}))
const db = { from: vi.fn(), rpc: vi.fn() }
const id = "11111111-1111-4111-8111-111111111111"
const req = (data: unknown) =>
  new NextRequest("https://gongnori.fan/api/admin/news-desk/articles", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: "editor-id", role: "editor", supabase: db })
  mocks.list.mockResolvedValue({
    items: [{ kind: "post", id, title: "기존 기사", created_at: "2026-09-15" }],
    total: 1,
    page: 1,
    limit: 30,
  })
  mocks.import.mockResolvedValue({ id: "desk-id", existing: false })
})

describe("existing article desk import API", () => {
  it.each([401, 403])(
    "rejects access with %s before reading articles or importing",
    async (status) => {
      mocks.auth.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
      const { GET, POST } = await import("@/app/api/admin/news-desk/articles/route")
      expect(
        (await GET(new NextRequest("https://gongnori.fan/api/admin/news-desk/articles"))).status
      ).toBe(status)
      expect((await POST(req({ kind: "post", id }))).status).toBe(status)
      expect(mocks.list).not.toHaveBeenCalled()
      expect(mocks.import).not.toHaveBeenCalled()
    }
  )

  it.each(["editor", "admin"])(
    "allows %s to import a real article with actor attribution",
    async (role) => {
      mocks.auth.mockResolvedValue({ userId: `${role}-id`, role, supabase: db })
      const { POST } = await import("@/app/api/admin/news-desk/articles/route")
      const response = await POST(req({ kind: "post", id }))
      expect(response.status).toBe(200)
      expect(response.headers.get("Cache-Control")).toBe("private, no-store")
      expect(await response.json()).toEqual({ id: "desk-id", existing: false })
      expect(mocks.import).toHaveBeenCalledWith(db, { kind: "post", id }, `${role}-id`)
      expect(db.from).not.toHaveBeenCalled()
      expect(db.rpc).not.toHaveBeenCalled()
    }
  )

  it("trims and bounds article search and preserves private cache headers", async () => {
    const { GET } = await import("@/app/api/admin/news-desk/articles/route")
    const response = await GET(
      new NextRequest(
        `https://gongnori.fan/api/admin/news-desk/articles?q=${encodeURIComponent("  과거 기사  ")}&page=4&status=rejected`
      )
    )
    expect(mocks.list).toHaveBeenCalledWith(db, { q: "과거 기사", page: 4, status: "rejected" })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toMatchObject({ limit: 30, items: [{ id }] })
  })

  it("opens the existing private desk item when the import RPC reports it already exists", async () => {
    mocks.import.mockResolvedValue({ id: "existing-desk-item", existing: true })
    const { POST } = await import("@/app/api/admin/news-desk/articles/route")
    expect(await (await POST(req({ kind: "draft", id: "hermes-draft" }))).json()).toEqual({
      id: "existing-desk-item",
      existing: true,
    })
    expect(mocks.import).toHaveBeenCalledExactlyOnceWith(
      db,
      { kind: "draft", id: "hermes-draft" },
      "editor-id"
    )
  })

  it.each([
    { kind: "post", id: "not-a-uuid" },
    { kind: "draft", id: "" },
    { kind: "draft", id: "x".repeat(201) },
    { kind: "url", id: "https://example.com" },
  ])("rejects invalid article references before import: %j", async (reference) => {
    const { POST } = await import("@/app/api/admin/news-desk/articles/route")
    expect((await POST(req(reference))).status).toBe(400)
    expect(mocks.import).not.toHaveBeenCalled()
  })

  it("reports list and import storage failures without returning success", async () => {
    mocks.list.mockRejectedValue(Error("storage offline"))
    mocks.import.mockRejectedValue(Error("기사를 작업함에 저장하지 못했습니다."))
    const { GET, POST } = await import("@/app/api/admin/news-desk/articles/route")
    expect(
      (await GET(new NextRequest("https://gongnori.fan/api/admin/news-desk/articles"))).status
    ).toBe(503)
    const response = await POST(req({ kind: "post", id }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "기사를 작업함에 저장하지 못했습니다." })
  })
})
