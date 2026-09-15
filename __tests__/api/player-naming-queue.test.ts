// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), rpc: vi.fn(), requeue: vi.fn() }))
vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApi: mocks.auth }))
vi.mock("@/lib/news/notation/player-naming-queue", async () => ({
  ...(await vi.importActual("@/lib/news/notation/player-naming-queue")),
  loadPlayerNamingQueue: mocks.load,
}))
vi.mock("@/lib/news/dictionary-recheck", () => ({
  requeueDraftsUnblockedByDictionary: mocks.requeue,
}))
const row = {
  key: "squad:arsenal:saka",
  kind: "squad",
  id: "saka",
  team_id: "arsenal",
  expected: "2026-09-15T00:00:00.000Z",
  news_id: "dictionary-saka",
  news_expected: "2026-09-15T00:00:00.000Z",
  news_name_kr: "부카요 사카",
  name_kr: "부카요 사카",
  given_name_ko: "부카요",
  family_name_ko: "사카",
  short_name_ko: "사카",
}
const request = (body: unknown) =>
  new NextRequest("https://example.com/api/admin/player-naming-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: "admin", supabase: { rpc: mocks.rpc } })
  mocks.load.mockResolvedValue({ items: [], total: 0, page: 0, pageSize: 100 })
  mocks.rpc.mockResolvedValue({ data: { saved: [row.key], failed: [] }, error: null })
  mocks.requeue.mockResolvedValue({ failed: 0 })
})

describe("admin batch player naming", () => {
  it("requires admin before reading names or mutating rows", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))
    const { GET, POST } = await import("@/app/api/admin/player-naming-queue/route")
    expect(
      (await GET(new NextRequest("https://example.com/api/admin/player-naming-queue"))).status
    ).toBe(403)
    expect((await POST(request({ entries: [row] }))).status).toBe(403)
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("defaults to missing Korean names and passes validated paging/search", async () => {
    const { GET } = await import("@/app/api/admin/player-naming-queue/route")
    const result = await GET(
      new NextRequest("https://example.com/api/admin/player-naming-queue?q=Saka&page=2")
    )
    expect(result.headers.get("cache-control")).toBe("no-store")
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), {
      filter: "missing",
      q: "Saka",
      page: 2,
    })
    await GET(new NextRequest("https://example.com/api/admin/player-naming-queue?filter=korean"))
    expect(mocks.load).toHaveBeenLastCalledWith(expect.anything(), {
      filter: "korean",
      q: "",
      page: 0,
    })
  })
  it("sends edited rows through the atomic RPC and preserves row-level partial failures", async () => {
    const failedRow = { ...row, key: "squad:arsenal:other", id: "other" }
    mocks.rpc.mockResolvedValue({
      data: {
        saved: [row.key],
        failed: [{ key: failedRow.key, error: "다른 창에서 수정했습니다." }],
      },
      error: null,
    })
    const { POST } = await import("@/app/api/admin/player-naming-queue/route")
    const response = await POST(request({ entries: [row, failedRow] }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      saved: [row.key],
      failed: [{ key: failedRow.key, error: "다른 창에서 수정했습니다." }],
      recheckPending: false,
    })
    expect(mocks.rpc).toHaveBeenCalledWith("save_player_naming_rows", {
      p_rows: [row, failedRow],
      p_actor: "admin",
    })
    expect(mocks.requeue).toHaveBeenCalledOnce()
  })
  it("preserves successful saves if the separate article recheck fails", async () => {
    mocks.requeue.mockRejectedValueOnce(Error("unavailable"))
    const { POST } = await import("@/app/api/admin/player-naming-queue/route")
    expect(await (await POST(request({ entries: [row] }))).json()).toMatchObject({
      saved: [row.key],
      recheckPending: true,
    })
    mocks.rpc.mockResolvedValueOnce({
      data: { saved: [], failed: [{ key: row.key, error: "conflict" }] },
      error: null,
    })
    mocks.requeue.mockClear()
    await POST(request({ entries: [row] }))
    expect(mocks.requeue).not.toHaveBeenCalled()
  })
  it("rejects bad names, duplicate rows and requests above 100 before the RPC", async () => {
    const { POST } = await import("@/app/api/admin/player-naming-queue/route")
    for (const entries of [
      [{ ...row, name_kr: "Bukayo Saka" }],
      [row, row],
      Array.from({ length: 101 }, (_, i) => ({ ...row, id: String(i), key: `squad:arsenal:${i}` })),
    ]) {
      expect((await POST(request({ entries }))).status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
