import { describe, it, expect, vi } from "vitest"
import { loadCorrectionCases } from "@/lib/news/desk/correction-cases"
import type { SupabaseClient } from "@supabase/supabase-js"
const before = { title: "영입 확정", article: "원문은 구단 사이 협상 중인 단계라고 보도했다." }
function database(rows: unknown[], error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
}
describe("immediate human correction examples", () => {
  it("uses pending AI analysis and title-only edits, deduplicating article revisions", async () => {
    const rows = [
      {
        id: "r1",
        item_id: "one",
        before_draft: before,
        after_draft: { ...before, title: "영입 협상" },
        editor_reason: "확정 아님",
      },
      {
        id: "r2",
        item_id: "one",
        before_draft: before,
        after_draft: { ...before, title: "이전 수정" },
      },
      { id: "r3", item_id: "two", before_draft: before, after_draft: before },
      {
        id: "r4",
        item_id: "three",
        before_draft: before,
        after_draft: { ...before, article: "수정한 문장" },
      },
    ]
    const cases = await loadCorrectionCases(database(rows))
    expect(cases.map((c) => c.revision_id)).toEqual(["r1", "r4"])
    expect(cases[0]).toMatchObject({
      beforeTitle: "영입 확정",
      afterTitle: "영입 협상",
      reason: "확정 아님",
    })
  })
  it("does not report missing guidance as an empty learning history", async () => {
    await expect(loadCorrectionCases(database([], { code: "offline" }))).rejects.toThrow(
      "교정 사례"
    )
  })
})
