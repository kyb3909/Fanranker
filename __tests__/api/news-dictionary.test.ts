import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), list: vi.fn(), requeue: vi.fn() }))
vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApi: mocks.auth }))
vi.mock("@/lib/news/notation/manage", async () => ({
  ...(await vi.importActual("@/lib/news/notation/manage")),
  listManagedNotation: mocks.list,
}))
vi.mock("@/lib/news/dictionary-recheck", () => ({
  requeueDraftsUnblockedByDictionary: mocks.requeue,
}))
const db = { rpc: mocks.rpc }
const timestamp = "2026-09-15T06:00:00.000Z"
const entry = {
  category: "player",
  preferred_ko: "손흥민",
  romanized: "Son Heung-min",
  surfaces: ["Heung-min Son", "쏘니"],
  disambiguation: "대한민국 공격수",
  notes: "대표 표기 확정",
}
const req = (body: unknown) =>
  new NextRequest("https://gongnori.fan/api/admin/news-dictionary", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: "admin-id", supabase: db })
  mocks.rpc.mockResolvedValue({ data: { id: "son" }, error: null })
  mocks.list.mockResolvedValue([])
  mocks.requeue.mockResolvedValue(undefined)
})

describe("managed notation API", () => {
  it.each([401, 403])("requires admin access for read and write: %s", async (status) => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
    const { GET, POST } = await import("@/app/api/admin/news-dictionary/route")
    expect(
      (await GET(new NextRequest("https://gongnori.fan/api/admin/news-dictionary"))).status
    ).toBe(status)
    expect((await POST(req({ action: "save", entry, expected: null }))).status).toBe(status)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.requeue).not.toHaveBeenCalled()
  })

  it("searches romanized names and legacy aliases, filters categories and paginates", async () => {
    mocks.list.mockResolvedValue([
      ...Array.from({ length: 42 }, (_, i) => ({
        ...entry,
        id: `person-${i}`,
        romanized: "",
        surfaces: [],
        hangul_alts: ["쏘니"],
      })),
      { ...entry, id: "team", category: "team" },
    ])
    const { GET } = await import("@/app/api/admin/news-dictionary/route")
    const response = await GET(
      new NextRequest(
        "https://gongnori.fan/api/admin/news-dictionary?q=%EC%8F%98%EB%8B%88&category=player&page=1"
      )
    )
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      total: 42,
      page: 1,
      entries: [{ id: "person-40" }, { id: "person-41" }],
    })
    mocks.list.mockResolvedValue([{ ...entry, id: "son" }])
    expect(
      await (
        await GET(new NextRequest("https://gongnori.fan/api/admin/news-dictionary?q=SON"))
      ).json()
    ).toMatchObject({ total: 1 })
  })

  it("requires an expected timestamp for updates and forbids one for a new entry", async () => {
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    expect(
      (await POST(req({ action: "save", entry: { ...entry, id: "son" }, expected: null }))).status
    ).toBe(400)
    expect((await POST(req({ action: "save", entry, expected: timestamp }))).status).toBe(400)
    expect(
      (await POST(req({ action: "save", entry: { ...entry, surfaces: ["x"] }, expected: null })))
        .status
    ).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(["40001", "23505"])(
    "reports stale or colliding entries as a conflict: %s",
    async (code) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code } })
      const { POST } = await import("@/app/api/admin/news-dictionary/route")
      expect(
        (await POST(req({ action: "save", entry: { ...entry, id: "son" }, expected: timestamp })))
          .status
      ).toBe(409)
      expect(mocks.requeue).not.toHaveBeenCalled()
    }
  )

  it("preserves a successful save if queued drafts need a later recheck", async () => {
    mocks.requeue.mockRejectedValue(Error("temporary outage"))
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    const response = await POST(req({ action: "save", entry, expected: null }))
    expect(await response.json()).toEqual({ ok: true, id: "son", recheckPending: true })
    expect(mocks.rpc).toHaveBeenCalledWith("save_news_notation_entry", {
      p_entry: { ...entry, given_name_ko: "", family_name_ko: "", short_name_ko: "" },
      p_expected: null,
      p_delete: false,
      p_actor: "admin-id",
    })
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requeue.mock.invocationCallOrder[0]
    )
  })

  it.each(["player", "coach"])(
    "preserves the full first mention and explicit given, family, and short names for %s",
    async (category) => {
      const { POST } = await import("@/app/api/admin/news-dictionary/route")
      const person = {
        ...entry,
        category,
        preferred_ko: "부카요 사카",
        romanized: "Bukayo Saka",
        given_name_ko: " 부카요 ",
        family_name_ko: " 사카 ",
        short_name_ko: " 사카 ",
      }
      expect((await POST(req({ action: "save", entry: person, expected: null }))).status).toBe(200)
      expect(mocks.rpc).toHaveBeenCalledWith("save_news_notation_entry", {
        p_entry: {
          ...person,
          given_name_ko: "부카요",
          family_name_ko: "사카",
          short_name_ko: "사카",
        },
        p_expected: null,
        p_delete: false,
        p_actor: "admin-id",
      })
    }
  )

  it.each(["given_name_ko", "family_name_ko", "short_name_ko"])(
    "rejects %s longer than 100 characters before saving or requeueing",
    async (field) => {
      const { POST } = await import("@/app/api/admin/news-dictionary/route")
      const response = await POST(
        req({
          action: "save",
          entry: { ...entry, [field]: "가".repeat(101) },
          expected: null,
        })
      )
      expect(response.status).toBe(400)
      expect(mocks.rpc).not.toHaveBeenCalled()
      expect(mocks.requeue).not.toHaveBeenCalled()
    }
  )

  it("accepts a one-character Korean family name without changing the full display name", async () => {
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    const person = {
      ...entry,
      preferred_ko: "김민재",
      romanized: "Kim Min-jae",
      given_name_ko: "민재",
      family_name_ko: "김",
      short_name_ko: "김민재",
    }
    expect((await POST(req({ action: "save", entry: person, expected: null }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_news_notation_entry",
      expect.objectContaining({ p_entry: person })
    )
  })

  it("leaves missing name parts empty instead of inferring a surname from the last token", async () => {
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    const person = { ...entry, preferred_ko: "버질 반 다이크", romanized: "Virgil van Dijk" }
    expect((await POST(req({ action: "save", entry: person, expected: null }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_news_notation_entry",
      expect.objectContaining({
        p_entry: { ...person, given_name_ko: "", family_name_ko: "", short_name_ko: "" },
      })
    )
  })

  it.each(["team", "competition", "media", "term"])(
    "clears personal name fields when the entry is saved as %s",
    async (category) => {
      const { POST } = await import("@/app/api/admin/news-dictionary/route")
      const nonPerson = {
        ...entry,
        category,
        given_name_ko: "이름",
        family_name_ko: "성",
        short_name_ko: "약칭",
      }
      expect((await POST(req({ action: "save", entry: nonPerson, expected: null }))).status).toBe(
        200
      )
      expect(mocks.rpc).toHaveBeenCalledWith(
        "save_news_notation_entry",
        expect.objectContaining({
          p_entry: { ...nonPerson, given_name_ko: "", family_name_ko: "", short_name_ko: "" },
        })
      )
    }
  )

  it.each([
    ["given_name_ko", "부카요\n사카"],
    ["family_name_ko", "[사카]"],
    ["short_name_ko", "사카\r선수"],
  ])("rejects unsupported notation in %s", async (field, value) => {
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    expect(
      (await POST(req({ action: "save", entry: { ...entry, [field]: value }, expected: null })))
        .status
    ).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(["given_name_ko", "family_name_ko", "short_name_ko"])(
    "finds and returns an entry through its saved %s",
    async (field) => {
      mocks.list.mockResolvedValue([{ ...entry, id: "matching-name", [field]: "검색대상" }])
      const { GET } = await import("@/app/api/admin/news-dictionary/route")
      const response = await GET(
        new NextRequest(
          `https://gongnori.fan/api/admin/news-dictionary?q=${encodeURIComponent("검색대상")}`
        )
      )
      expect(await response.json()).toMatchObject({
        total: 1,
        entries: [{ id: "matching-name", [field]: "검색대상" }],
      })
    }
  )

  it("sends deletion through the timestamp-checked transaction without requeueing", async () => {
    const { POST } = await import("@/app/api/admin/news-dictionary/route")
    expect((await POST(req({ action: "delete", id: "son", expected: timestamp }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("save_news_notation_entry", {
      p_entry: { id: "son" },
      p_expected: timestamp,
      p_delete: true,
      p_actor: "admin-id",
    })
    expect(mocks.requeue).not.toHaveBeenCalled()
  })
})
