import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  after: vi.fn(),
  learn: vi.fn(),
  publish: vi.fn(),
}))
vi.mock("next/server", async () => ({
  ...(await vi.importActual("next/server")),
  after: mocks.after,
}))
vi.mock("@/lib/admin/roles", () => ({ requireStaff: mocks.auth }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: mocks.from }),
}))
vi.mock("@/lib/news/publish", () => ({ publishNewsDraft: mocks.publish }))
vi.mock("@/lib/news/learn-corrections", () => ({ learnFromDeskEdit: mocks.learn }))

const content = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "두 구단은 협상을 진행하고 있다." }] },
  ],
}
const original = { title: "협상 중인 선수", content }
let item: Record<string, any> | null
let loadError: { message: string } | null
let writeError: { message: string } | null
let beforeWrite: () => void
let writes: number

const request = (action: "save" | "reject", title = "구단 간 협상 진행") =>
  new NextRequest("https://gongnori.fan/api/admin/news-review", {
    method: "POST",
    body: JSON.stringify({ id: "draft-1", action, title, content }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: "editor" })
  item = {
    id: "draft-1",
    status: "drafted",
    updated_at: "2026-09-16T10:00:00.000Z",
    draft: structuredClone(original),
    urls: null,
    raw: null,
    entities: null,
    tags: null,
  }
  loadError = null
  writeError = null
  beforeWrite = () => {}
  writes = 0
  mocks.from.mockImplementation(() => {
    let patch: Record<string, unknown> | undefined
    const filters: [string, unknown][] = []
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters.push([key, value])
        return query
      },
      update: (value: Record<string, unknown>) => {
        patch = value
        return query
      },
      maybeSingle: async () => {
        if (!patch) return { data: structuredClone(item), error: loadError }
        writes++
        beforeWrite()
        if (writeError) return { data: null, error: writeError }
        if (!item || !filters.every(([key, value]) => item?.[key] === value)) {
          return { data: null, error: null }
        }
        Object.assign(item, patch)
        return { data: { id: item.id }, error: null }
      },
    }
    return query
  })
})

describe("news review saved-result integrity", () => {
  it("distinguishes a database read failure from a missing draft", async () => {
    const { POST } = await import("@/app/api/admin/news-review/route")
    item = null
    loadError = { message: "database unavailable" }
    expect((await POST(request("save"))).status).toBe(503)
    loadError = null
    expect((await POST(request("save"))).status).toBe(404)
    expect(writes).toBe(0)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it.each(["save", "reject"] as const)(
    "returns failure when %s was not persisted",
    async (action) => {
      const { POST } = await import("@/app/api/admin/news-review/route")
      writeError = { message: "database write timeout" }
      const response = await POST(request(action))
      expect(response.status).toBe(503)
      expect(await response.json()).not.toHaveProperty("ok", true)
      expect(item?.status).toBe("drafted")
      expect(item?.draft).toEqual(original)
      expect(mocks.after).not.toHaveBeenCalled()
      expect(mocks.learn).not.toHaveBeenCalled()
      expect(mocks.publish).not.toHaveBeenCalled()
    }
  )

  it.each(["save", "reject"] as const)(
    "does not overwrite publication racing with %s",
    async (action) => {
      const { POST } = await import("@/app/api/admin/news-review/route")
      beforeWrite = () => {
        item!.status = "published"
      }
      expect((await POST(request(action))).status).toBe(409)
      expect(item?.status).toBe("published")
      expect(item?.draft).toEqual(original)
      expect(mocks.after).not.toHaveBeenCalled()
    }
  )

  it.each(["save", "reject"] as const)("preserves another edit made during %s", async (action) => {
    const { POST } = await import("@/app/api/admin/news-review/route")
    beforeWrite = () => {
      item!.updated_at = "2026-09-16T10:00:01.000Z"
      item!.draft = { title: "다른 편집자의 수정", content }
    }
    expect((await POST(request(action))).status).toBe(409)
    expect(item?.draft.title).toBe("다른 편집자의 수정")
    expect(item?.status).toBe("drafted")
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it("saves the original comparison material without publishing or starting learning", async () => {
    const { POST } = await import("@/app/api/admin/news-review/route")
    const response = await POST(request("save"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, saved: true })
    expect(item?.draft).toMatchObject({ title: "구단 간 협상 진행", original })
    expect(item?.status).toBe("drafted")
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("starts learning only after a corrected rejection has been stored", async () => {
    const { POST } = await import("@/app/api/admin/news-review/route")
    const response = await POST(request("reject"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, status: "rejected", learning: true })
    expect(item?.status).toBe("rejected")
    expect(item?.draft).toMatchObject({ title: "구단 간 협상 진행", original })
    expect(mocks.after).toHaveBeenCalledOnce()
    expect(mocks.learn).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.learn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "reservoir:draft-1",
        originalTitle: original.title,
        finalTitle: "구단 간 협상 진행",
      })
    )
  })

  it("does not create a lesson for an unchanged rejection", async () => {
    const { POST } = await import("@/app/api/admin/news-review/route")
    expect((await POST(request("reject", original.title))).status).toBe(200)
    expect(item?.status).toBe("rejected")
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
