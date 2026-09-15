// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
const mocks = vi.hoisted(() => ({ open: vi.fn(), rules: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/news/desk/catalog", () => ({ openDeskArticle: mocks.open }))
vi.mock("@/lib/news/training/settings", () => ({ loadEditorialRules: mocks.rules }))
vi.mock("@/lib/news/desk/service", () => ({ kstDayStart: () => "2026-09-15T15:00:00.000Z" }))
import { refillLiveDesk } from "@/lib/news/desk/auto-queue"

const now = Date.parse("2026-09-15T19:00:00Z")
type Row = Record<string, any>
let items: Row[], candidates: Row[], settings: Row, mutations: { table: string; data: Row }[]
let busy: boolean, sourceError: boolean
const candidate = (id: string): Row => ({
  id,
  status: "drafted",
  created_at: "2026-09-15T18:00:00Z",
  draft: { content: { type: "doc", content: [] } },
  urls: { source: `https://club.example/news/${id}` },
  raw: {
    source_text: "Original source. ".repeat(20),
    editorial_guidance: {
      loaded_at: "2026-09-15T17:00:00Z",
      applied_rule_ids: ["rule"],
      applied_lesson_ids: ["lesson"],
    },
  },
})
function client() {
  return {
    from(table: string) {
      let operation = "read",
        update: Row = {},
        head = false,
        one = false
      const filters: ((row: Row) => boolean)[] = []
      const value = (row: Row, key: string) =>
        key === "origin->>auto_queue" ? String(row.origin?.auto_queue) : row[key]
      const chain: any = {
        select: (_fields: string, opts?: { head?: boolean }) => {
          head = !!opts?.head
          return chain
        },
        eq: (key: string, val: unknown) => {
          filters.push((row) => value(row, key) === val)
          return chain
        },
        not: (key: string, _op: string, val: unknown) => {
          filters.push((row) => row[key] !== val)
          return chain
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]))
          return chain
        },
        gte: (key: string, val: string) => {
          filters.push((row) => row[key] >= val)
          return chain
        },
        order: () => chain,
        limit: () => chain,
        or: () => {
          if (busy) filters.push(() => false)
          return chain
        },
        single: () => {
          one = true
          return chain
        },
        maybeSingle: () => {
          one = true
          return chain
        },
        update: (data: Row) => {
          operation = "update"
          update = data
          return chain
        },
        then: (resolve: (data: unknown) => unknown) => {
          const rows = (
            table === "news_desk_settings"
              ? [settings]
              : table === "news_desk_items"
                ? items
                : candidates
          ).filter((row) => filters.every((test) => test(row)))
          if (table === "news_reservoir" && sourceError)
            return Promise.resolve({ error: { message: "unavailable" }, data: null }).then(resolve)
          if (operation === "update") {
            mutations.push({ table, data: update })
            rows.forEach((row) => Object.assign(row, update))
          }
          return Promise.resolve({
            data: head ? null : one ? (rows[0] ?? null) : rows,
            error: null,
            count: rows.length,
          }).then(resolve)
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
}
beforeEach(() => {
  vi.clearAllMocks()
  items = []
  candidates = [candidate("new")]
  mutations = []
  busy = false
  sourceError = false
  settings = { id: true, enabled: true, pending_target: 6, daily_limit: 12, lease_until: null }
  mocks.rules.mockResolvedValue([{ id: "rule", updated_at: "2026-09-15T16:00:00Z" }])
  mocks.open.mockImplementation(async (_db, ref) => {
    const id = `desk-${ref.id}`
    items.push({
      id,
      status: "drafted",
      created_at: new Date(now).toISOString(),
      source_reservoir_id: `live-draft:${ref.id}`,
      origin: ref,
      sources: [{ source_url: `https://club.example/news/${ref.id}` }],
    })
    return { id, existing: false }
  })
})
describe("automatic real article desking", () => {
  it("does not let private practice or historical manual articles block fresh articles", async () => {
    items = Array.from({ length: 6 }, (_, i) => ({
      id: `practice-${i}`,
      status: "drafted",
      origin: null,
    }))
    items.push({
      id: "history",
      source_reservoir_id: "old",
      status: "drafted",
      origin: { id: "old" },
      sources: [],
    })
    expect(await refillLiveDesk(client(), now)).toMatchObject({ added: 1, pending: 1 })
    expect(items.at(-1)).toMatchObject({
      origin: { id: "new", auto_queue: true },
      applied_rule_ids: ["rule"],
      applied_lesson_ids: ["lesson"],
    })
    expect(
      mutations.every((m) => ["news_desk_items", "news_desk_settings"].includes(m.table))
    ).toBe(true)
    expect(mutations.some((m) => "draft" in m.data || "status" in m.data)).toBe(false)
  })
  it("preserves completed work and deduplicates both article IDs and source URLs", async () => {
    const db = client()
    await refillLiveDesk(db, now)
    items[0].status = "reviewed"
    candidates.push({ ...candidate("duplicate"), urls: candidate("new").urls })
    expect(await refillLiveDesk(db, now)).toMatchObject({ added: 0 })
    expect(mocks.open).toHaveBeenCalledTimes(1)
    expect(items[0].status).toBe("reviewed")
  })
  it("excludes articles missing current rules or written before a rule changed", async () => {
    candidates = [candidate("missing"), candidate("old"), candidate("valid")]
    candidates[0].raw.editorial_guidance.applied_rule_ids = []
    candidates[1].raw.editorial_guidance.loaded_at = "2026-09-15T15:00:00Z"
    expect(await refillLiveDesk(client(), now)).toMatchObject({ added: 1 })
    expect(mocks.open.mock.calls[0][1]).toEqual({ kind: "draft", id: "valid" })
  })
  it.each(["paused", "busy"])("does not import while %s", async (state) => {
    if (state === "paused") settings.enabled = false
    else busy = true
    expect(await refillLiveDesk(client(), now)).toMatchObject({ skipped: state, added: 0 })
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it.each(["queue_full", "daily_limit"])(
    "enforces %s and releases the worker lease",
    async (reason) => {
      settings.pending_target = 1
      settings.daily_limit = 1
      items.push({
        id: "prior",
        created_at: new Date(now).toISOString(),
        status: reason === "queue_full" ? "drafted" : "reviewed",
        source_reservoir_id: "prior",
        origin: { id: "prior", auto_queue: true },
        sources: [],
      })
      expect(await refillLiveDesk(client(), now)).toMatchObject({ skipped: reason, added: 0 })
      expect(mocks.open).not.toHaveBeenCalled()
      expect(settings.lease_until).toBeNull()
    }
  )
  it("releases its lease when the source store is unavailable", async () => {
    sourceError = true
    await expect(refillLiveDesk(client(), now)).rejects.toThrow("새로 작성된 기사")
    expect(settings.lease_token).toBeNull()
    expect(settings.last_error).toContain("새로 작성된 기사")
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it("stops at the remaining daily allowance even when more fresh articles are available", async () => {
    settings.daily_limit = 1
    candidates.push(candidate("second"))
    expect(await refillLiveDesk(client(), now)).toMatchObject({ added: 1 })
    expect(mocks.open).toHaveBeenCalledTimes(1)
  })
})
