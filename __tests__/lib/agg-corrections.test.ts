import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadAggCorrections } from "@/data/agents/core/agg-corrections.mjs"

function database(rows: unknown[], error: unknown = null) {
  const chain = {
    select: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(async () => ({ data: rows, error })),
  }
  for (const fn of [chain.select, chain.in, chain.order]) fn.mockReturnValue(chain)
  return { db: { from: vi.fn(() => chain) } as unknown as SupabaseClient, chain }
}
const corrected = (id: string, title = id) => ({
  id,
  status: "corrected",
  persona: "팬",
  ai_title: title,
  ai_body: "원문 1\n\n원문 2",
  fix_title: `수정 ${id}`,
  fix_body: "수정 1\n\n수정 2",
  reviewed_at: "2026-09-15",
  learned_at: "2026-09-14",
})

describe("shared community correction loading", () => {
  it("includes previously exported learned rows and retains IDs for practice/live attribution", async () => {
    const { db, chain } = database([
      corrected("new"),
      {
        id: "reject",
        status: "rejected",
        source_title: "광고",
        reject_reason: "홍보 소재",
        learned_at: "2026-09-14",
      },
    ])
    const result = await loadAggCorrections(db)
    expect(chain.in).toHaveBeenCalledWith("status", ["corrected", "rejected"])
    expect(result.pairs[0]).toMatchObject({
      id: "new",
      before: { paragraphs: ["원문 1", "원문 2"] },
      after: { paragraphs: ["수정 1", "수정 2"] },
    })
    expect(result.rejects).toEqual([{ id: "reject", source_title: "광고", reason: "홍보 소재" }])
    // The query intentionally has no learned_at IS NULL filter: old CLI exports stay active.
    expect(Object.keys(chain)).not.toContain("is")
  })

  it("prefers the newest DB correction over legacy duplicates without mutating the base", async () => {
    const base = {
      pairs: [
        {
          persona: "팬",
          before: { title: "동일 초안", paragraphs: ["옛 초안"] },
          after: { title: "옛 교정", paragraphs: ["옛 교정"] },
        },
      ],
      rejects: [{ source_title: "광고", reason: "옛 이유" }],
    }
    const original = structuredClone(base)
    const { db } = database([
      corrected("newest", "동일 초안"),
      corrected("older", "동일 초안"),
      { id: "reject-new", status: "rejected", source_title: "광고", reject_reason: "새 이유" },
    ])
    const result = await loadAggCorrections(db, base)
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]).toMatchObject({ id: "newest", after: { title: "수정 newest" } })
    expect(result.rejects).toEqual([{ id: "reject-new", source_title: "광고", reason: "새 이유" }])
    expect(base).toEqual(original)
  })

  it("caps each recent correction group independently and excludes incomplete edits", async () => {
    const { db } = database([
      { ...corrected("incomplete"), fix_body: null },
      ...Array.from({ length: 10 }, (_, i) => corrected(`p${i}`)),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        status: "rejected",
        source_title: `소재 ${i}`,
      })),
    ])
    const result = await loadAggCorrections(db)
    expect(result.pairs.map((p) => p.id)).toEqual(["p7", "p6", "p5", "p4", "p3", "p2", "p1", "p0"])
    expect(result.rejects.map((r) => r.id)).toEqual([
      "r7",
      "r6",
      "r5",
      "r4",
      "r3",
      "r2",
      "r1",
      "r0",
    ])
  })

  it("does not silently revert to old examples when current corrections cannot be read", async () => {
    const { db } = database([], { message: "database unavailable" })
    await expect(loadAggCorrections(db)).rejects.toThrow("교정 이력")
  })
})
