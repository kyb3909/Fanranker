import { afterEach, beforeEach, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ fetch: vi.fn(), cache: new Map<string, unknown>() }))
vi.mock("@/lib/lfa/client", () => ({ lfaFetch: m.fetch }))
vi.mock("@/lib/match/resolve-team-id", () => ({ resolveTeamId: async () => null }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }))
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args])
      if (!m.cache.has(key)) m.cache.set(key, await fn(...args))
      return m.cache.get(key)
    },
}))
import { getLfaLineup } from "@/lib/lfa/lineups"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-06T17:45:00Z"))
  m.cache.clear()
  m.fetch.mockReset()
  vi.spyOn(console, "info").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("공급자 수신 시각이 캐시 재조회와 선수명 변환 이후에도 보존된다", async () => {
  m.fetch.mockResolvedValue({
    is_projected: true,
    home: { starting: [{ name: "Home" }], subs: [] },
    away: { starting: [{ name: "Away" }], subs: [] },
  })
  const first = await getLfaLineup("match", "Home", "Away")
  expect(first?.fetchedAt).toBe("2026-09-06T17:45:00.000Z")
  vi.setSystemTime(new Date("2026-09-06T18:18:00Z"))
  const cached = await getLfaLineup("match", "Home", "Away")
  expect(cached?.fetchedAt).toBe(first?.fetchedAt)
  expect(m.fetch).toHaveBeenCalledTimes(1)
  expect(console.info).toHaveBeenCalledTimes(1)
})

it("공급자 실패를 캐시하지 않아 다음 호출에서 재시도한다", async () => {
  m.fetch.mockResolvedValueOnce(null).mockResolvedValueOnce({
    is_projected: false,
    home: { starting: [{ name: "Home" }] },
    away: { starting: [{ name: "Away" }] },
  })
  expect(await getLfaLineup("match", "Home", "Away")).toBeNull()
  expect(await getLfaLineup("match", "Home", "Away")).toMatchObject({ projected: false })
  expect(m.fetch).toHaveBeenCalledTimes(2)
})

it("자동 수집은 예상 캐시가 있어도 새 확정 응답을 기다려 반환한다", async () => {
  const sides = {
    home: { starting: [{ name: "Home" }] },
    away: { starting: [{ name: "Away" }] },
  }
  m.fetch
    .mockResolvedValueOnce({ ...sides, is_projected: true })
    .mockResolvedValueOnce({ ...sides, is_projected: false })
  expect(await getLfaLineup("match", "Home", "Away")).toMatchObject({ projected: true })
  vi.setSystemTime(new Date("2026-09-06T17:47:00Z"))
  expect(await getLfaLineup("match", "Home", "Away", { refresh: true })).toMatchObject({
    projected: false,
    fetchedAt: "2026-09-06T17:47:00.000Z",
  })
  expect(m.fetch).toHaveBeenCalledTimes(2)
})
