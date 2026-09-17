import { expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { applyLabelRepair, type LabelRepairPatch } from "@/lib/dictionary/label-repair-store"
const patch: LabelRepairPatch = {
  table: "polls",
  id: "poll",
  before: [{ key: "stable", label: "D. Solanke" }],
  after: [{ key: "stable", label: "도미닉 솔랑케" }],
  changes: [
    {
      path: ["0", "label"],
      team: "토트넘",
      before: "D. Solanke",
      after: "도미닉 솔랑케",
      reason: "provider-id",
      korean: true,
    },
  ],
}
function mock(
  data: unknown[] | null,
  error: { message: string } | null = null,
  stored: unknown = patch.after
) {
  const write = { update: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue({ data, error }) }
  write.update.mockReturnValue(write)
  write.eq.mockReturnValue(write)
  const read = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { options: stored }, error: null }),
  }
  read.select.mockReturnValue(read)
  read.eq.mockReturnValue(read)
  const from = vi.fn().mockReturnValueOnce(write).mockReturnValueOnce(read)
  return { db: { from } as unknown as SupabaseClient, write, from }
}
it("후보판 전체가 그대로일 때만 변경하고 실제 저장 결과를 확인한다", async () => {
  const { db, write, from } = mock([{ id: "poll" }])
  expect(await applyLabelRepair(db, patch)).toBe("applied")
  expect(write.eq).toHaveBeenCalledWith("options", JSON.stringify(patch.before))
  expect(write.eq).toHaveBeenCalledWith("kind", "motm")
  expect(write.update).toHaveBeenCalledWith({ options: patch.after })
  expect(from.mock.calls.every((c) => c[0] === "polls")).toBe(true)
})
it("다른 수집이 옵션을 추가해 0행 갱신되면 성공 건수로 세지 않는다", async () => {
  const { db, from } = mock([])
  expect(await applyLabelRepair(db, patch)).toBe("conflict")
  expect(from).toHaveBeenCalledTimes(1)
})
it("DB 오류와 null 응답을 성공으로 처리하지 않는다", async () => {
  await expect(applyLabelRepair(mock(null, { message: "offline" }).db, patch)).rejects.toThrow(
    "offline"
  )
  await expect(applyLabelRepair(mock(null).db, patch)).rejects.toThrow("no row data")
})
it("다시 읽은 값이 다르면 성공으로 보고하지 않는다", async () => {
  await expect(
    applyLabelRepair(mock([{ id: "poll" }], null, patch.before).db, patch)
  ).rejects.toThrow("verification")
})
it("투표 key 변경은 DB 요청 전에 거절한다", async () => {
  const { db, from } = mock([{ id: "poll" }])
  await expect(
    applyLabelRepair(db, { ...patch, after: [{ key: "changed", label: "도미닉 솔랑케" }] })
  ).rejects.toThrow("non-label")
  expect(from).not.toHaveBeenCalled()
})
