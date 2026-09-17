import { expect, it, vi } from "vitest"
import { readPages } from "@/lib/dictionary/read-pages"
it.each([0, 499, 500, 501, 1000, 1001])("끝 경계까지 %i행을 전부 읽는다", async (count) => {
  const rows = Array.from({ length: count }, (_, id) => ({ id }))
  const page = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }))
  expect(await readPages(page)).toEqual(rows)
})
it("뒤 페이지 실패 시 부분 결과를 반환하지 않는다", async () => {
  const page = vi
    .fn()
    .mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
  await expect(readPages(page)).rejects.toThrow("offline")
})
it("null 데이터도 빈 사전으로 취급하지 않는다", async () => {
  await expect(readPages(async () => ({ data: null, error: null }))).rejects.toThrow("no row data")
})
it("정확히 상한은 허용하고 다음 행이 있으면 실패한다", async () => {
  const rows = Array.from({ length: 501 }, (_, id) => id)
  await expect(
    readPages(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }), 500)
  ).rejects.toThrow("exceeds")
  expect(
    await readPages(
      async (from, to) => ({ data: rows.slice(0, 500).slice(from, to + 1), error: null }),
      500
    )
  ).toHaveLength(500)
})
