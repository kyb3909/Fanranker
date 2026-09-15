import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { deskArticleText, importLiveArticle, listLiveArticles } from "@/lib/news/desk/live-articles"

const mocks = vi.hoisted(() => ({ publish: vi.fn(), model: vi.fn() }))
vi.mock("@/lib/news/publish", () => ({
  NEWS_BOT_USER_ID: "user_bot_soccer_kr",
  publishNewsDraft: mocks.publish,
}))
vi.mock("@/lib/llm/usage-log", () => ({ openaiChat: mocks.model }))
const id = "11111111-1111-4111-8111-111111111111"
const body =
  "두 구단이 이적 협상을 진행하고 있다. 현재 합의는 이루어지지 않았으며 추가 논의가 이어질 예정이다."
const doc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
}
const article = {
  id,
  title: "구단 간 이적 협상 진행",
  content: doc,
  user_id: "user_bot_soccer_kr",
  community_slug: "football",
  deleted_at: null,
  created_at: "2026-09-15T06:00:00.000Z",
}
const original = {
  id: "hermes-source",
  created_at: "2026-09-15T05:00:00.000Z",
  status: "drafted",
  source: { type: "hermes" },
  urls: { source: "https://bbc.com/sport/football/story" },
  publish: { post_id: id },
  draft: { title: article.title, content: doc },
  raw: {
    sport: "football",
    source_text:
      "The clubs are negotiating a transfer. No agreement has been reached and the player remains with his current club.",
    original_title: "Clubs are negotiating",
    published_at: "2026-09-15T04:00:00.000Z",
  },
}
type Row = Record<string, unknown>

/** A read-only query fake applies access filters so their omission exposes forbidden rows. */
function database(tables: Record<string, Row[]>, errors: Record<string, unknown> = {}) {
  const chains: Array<{ table: string; chain: Record<string, ReturnType<typeof vi.fn>> }> = []
  const read = (row: Row, column: string) => {
    const [field, child] = column.split("->>")
    return child ? (row[field] as Row | undefined)?.[child] : row[field]
  }
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw Error(`unexpected mutation/read table ${table}`)
    let rows = [...tables[table]]
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => read(row, column) === value)
      return chain
    })
    chain.is = vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => read(row, column) === value)
      return chain
    })
    chain.filter = vi.fn((column: string, _operator: string, value: unknown) => {
      rows = rows.filter((row) => read(row, column) === value)
      return chain
    })
    chain.or = vi.fn((expression: string) => {
      rows = rows.filter((row) =>
        expression.split(",").some((part) => {
          const [column, value] = part.split(".eq.")
          return read(row, column) === value
        })
      )
      return chain
    })
    chain.order = vi.fn((column: string, options: { ascending: boolean }) => {
      rows.sort(
        (a, b) => String(a[column]).localeCompare(String(b[column])) * (options.ascending ? 1 : -1)
      )
      return chain
    })
    chain.limit = vi.fn((limit: number) => {
      rows = rows.slice(0, limit)
      return chain
    })
    chain.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: errors[table] ?? null }))
    chain.then = vi.fn((resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: errors[table] ?? null }).then(resolve)
    )
    chains.push({ table, chain })
    return chain
  })
  const rpc = vi.fn(async () => ({
    data: { id: "private-desk", existing: false },
    error: null as unknown,
  }))
  return { db: { from, rpc } as unknown as SupabaseClient, from, rpc, chains }
}

beforeEach(() => vi.clearAllMocks())

describe("existing article selection", () => {
  it("lists only nondeleted football bot posts and drafted football Hermes articles", async () => {
    const { db } = database({
      posts: [
        article,
        { ...article, id: "deleted", deleted_at: "2026-09-15" },
        { ...article, id: "human", user_id: "human" },
        { ...article, id: "basketball-post", community_slug: "basketball" },
      ],
      news_reservoir: [
        original,
        { ...original, id: "published", status: "published" },
        { ...original, id: "other-source", source: { type: "manual" } },
        { ...original, id: "basketball-draft", raw: { sport: "basketball" } },
        { ...original, id: "missing-title", draft: {} },
      ],
    })
    expect((await listLiveArticles(db, "")).map((row) => row.id)).toEqual([id, "hermes-source"])
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.model).not.toHaveBeenCalled()
  })

  it("merges both lists by recency, applies case-insensitive title search and bounds the result", async () => {
    const posts = Array.from({ length: 82 }, (_, i) => ({
      ...article,
      id: `post-${i}`,
      title: "BBC 협상 기사",
      created_at: new Date(Date.UTC(2026, 8, 15, 0, i)).toISOString(),
    }))
    const { db } = database({
      posts,
      news_reservoir: [
        {
          ...original,
          id: "latest-draft",
          created_at: "2026-09-16T00:00:00.000Z",
          draft: { title: "BBC 새 기사" },
        },
      ],
    })
    const listed = await listLiveArticles(db, "bbc")
    expect(listed).toHaveLength(80)
    expect(listed[0].id).toBe("latest-draft")
    expect(listed[1].id).toBe("post-81")
    expect(await listLiveArticles(db, "없는 검색어")).toEqual([])
  })
})

describe("existing article private import", () => {
  it("copies current published prose and saved source evidence with only the private import transaction", async () => {
    const tables = {
      posts: [structuredClone(article)],
      news_reservoir: [structuredClone(original)],
    }
    const unchanged = structuredClone(tables)
    const { db, rpc } = database(tables)
    expect(await importLiveArticle(db, { kind: "post", id }, "editor")).toEqual({
      id: "private-desk",
      existing: false,
    })
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "import_news_desk_article",
      expect.objectContaining({
        p_kind: "post",
        p_origin_id: id,
        p_actor: "editor",
        p_draft: { title: article.title, article: body },
        p_sources: [
          expect.objectContaining({
            id: "hermes-source",
            role: "current",
            source_url: original.urls.source,
            text: original.raw.source_text,
            published_at: original.raw.published_at,
          }),
        ],
      })
    )
    expect(tables).toEqual(unchanged)
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.model).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { ...original, urls: null },
    { ...original, urls: { source: "https://" } },
    { ...original, raw: { ...original.raw, source_text: "" } },
    { ...original, raw: { ...original.raw, source_text: `Access denied. ${"x".repeat(90)}` } },
  ])("keeps source-less articles editable without inventing evidence: %j", async (source) => {
    const { db, rpc } = database({ posts: [article], news_reservoir: source ? [source] : [] })
    await expect(importLiveArticle(db, { kind: "post", id }, "editor")).resolves.toEqual({
      id: "private-desk",
      existing: false,
    })
    expect(rpc).toHaveBeenCalledWith(
      "import_news_desk_article",
      expect.objectContaining({ p_draft: { title: article.title, article: body }, p_sources: [] })
    )
  })

  it.each([
    { ...article, user_id: "human" },
    { ...article, community_slug: "basketball" },
    { ...article, deleted_at: "2026-09-15" },
  ])("refuses to import a post outside the football-bot scope: %j", async (post) => {
    const { db, rpc } = database({ posts: [post], news_reservoir: [original] })
    await expect(importLiveArticle(db, { kind: "post", id }, "editor")).rejects.toThrow("축구 기사")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("imports a drafted Hermes article while rejecting NBA, non-Hermes and nondrafted rows", async () => {
    for (const row of [
      { ...original, raw: { sport: "basketball" } },
      { ...original, status: "published" },
      { ...original, source: { type: "manual" } },
    ]) {
      const { db, rpc } = database({ news_reservoir: [row] })
      await expect(
        importLiveArticle(db, { kind: "draft", id: original.id }, "editor")
      ).rejects.toThrow("축구 기사")
      expect(rpc).not.toHaveBeenCalled()
    }
    const { db, rpc } = database({ news_reservoir: [original] })
    await expect(
      importLiveArticle(db, { kind: "draft", id: original.id }, "editor")
    ).resolves.toEqual({ id: "private-desk", existing: false })
    expect(rpc).toHaveBeenCalledWith(
      "import_news_desk_article",
      expect.objectContaining({ p_kind: "draft", p_origin_id: original.id })
    )
  })

  it("returns the existing working copy identifier so a repeated import preserves earlier edits", async () => {
    const { db, rpc } = database({ posts: [article], news_reservoir: [original] })
    rpc.mockResolvedValue({ data: { id: "already-edited-desk", existing: true }, error: null })
    expect(await importLiveArticle(db, { kind: "post", id }, "editor")).toEqual({
      id: "already-edited-desk",
      existing: true,
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.model).not.toHaveBeenCalled()
  })

  it("leaves unknown publication times unknown and supports the legacy postId source link", async () => {
    const { db, rpc } = database({
      posts: [article],
      news_reservoir: [
        { ...original, publish: { postId: id }, raw: { ...original.raw, published_at: "unknown" } },
      ],
    })
    await importLiveArticle(db, { kind: "post", id }, "editor")
    expect(rpc).toHaveBeenCalledWith(
      "import_news_desk_article",
      expect.objectContaining({
        p_sources: [
          expect.objectContaining({ published_at: null, captured_at: original.created_at }),
        ],
      })
    )
  })

  it("reports storage and invalid-prose failures without creating an import", async () => {
    const badSource = database(
      { posts: [article], news_reservoir: [original] },
      { news_reservoir: { message: "read failed" } }
    )
    await expect(importLiveArticle(badSource.db, { kind: "post", id }, "editor")).rejects.toThrow(
      "원문 자료"
    )
    expect(badSource.rpc).not.toHaveBeenCalled()
    const tooLong = database({
      posts: [
        {
          ...article,
          content: { type: "doc", content: [{ type: "text", text: "x".repeat(8001) }] },
        },
      ],
      news_reservoir: [],
    })
    await expect(importLiveArticle(tooLong.db, { kind: "post", id }, "editor")).rejects.toThrow(
      "학습 편집 범위"
    )
    expect(tooLong.rpc).not.toHaveBeenCalled()
    const writeFailed = database({ posts: [article], news_reservoir: [] })
    writeFailed.rpc.mockResolvedValue({ data: null!, error: { message: "write failed" } })
    await expect(importLiveArticle(writeFailed.db, { kind: "post", id }, "editor")).rejects.toThrow(
      "작업함에 저장"
    )
  })
})

describe("plain text for desk editing", () => {
  it("preserves inline text, paragraph and line breaks, excluding image or embed metadata", () => {
    const content = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "제목" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "첫 문단의 " },
            { type: "text", text: "강조", marks: [{ type: "bold" }] },
            { type: "text", text: " 문장" },
            { type: "hardBreak" },
            { type: "text", text: "다음 줄" },
          ],
        },
        {
          type: "image",
          attrs: { src: "https://image.example/img.jpg", alt: "이 설명은 본문이 아니다" },
        },
        { type: "embed", attrs: { url: "https://video.example" } },
        { type: "paragraph", content: [{ type: "text", text: "둘째 문단" }] },
      ],
    }
    expect(deskArticleText(content).trim()).toBe(
      "제목\n\n첫 문단의 강조 문장\n다음 줄\n\n둘째 문단"
    )
    expect(deskArticleText(null)).toBe("")
    expect(deskArticleText("<p>raw HTML</p>")).toBe("")
  })
})
