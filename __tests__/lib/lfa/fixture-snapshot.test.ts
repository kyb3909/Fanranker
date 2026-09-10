import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/lfa/match", () => ({ getDaySnapshot: mocks.snapshot }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ neq: () => ({ not: async () => ({ data: [] }) }) }),
    }),
  }),
}))
vi.mock("@/lib/lfa/leagues", () => ({ BETMAN_CODE_BY_LFA_ID: new Map([["league", "UCL"]]) }))
vi.mock("@/lib/match/leagues", () => ({ MATCH_PAGE_LEAGUES: new Set(["UCL"]) }))
import { getLfaFixturesForMatchday } from "@/lib/lfa/fixtures"

beforeEach(() => {
  mocks.snapshot.mockReset()
  mocks.snapshot.mockImplementation(async (date: string) => ({
    updatedAt: 1234567890000,
    matches:
      date === "2026-09-09"
        ? [
            {
              id: "f1",
              kickoff: "22:00",
              league: { id: "league" },
              status: {},
              home: { id: "h", name: "Home" },
              away: { id: "a", name: "Away" },
            },
          ]
        : [],
  }))
})
it("fixture normalization preserves the original snapshot request time", async () => {
  const rows = await getLfaFixturesForMatchday("2026-09-10")
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ lfaId: "f1", sourceUpdatedAt: 1234567890000 })
})
it("cached snapshot rereads never restamp provider time", async () => {
  const one = await getLfaFixturesForMatchday("2026-09-10")
  const two = await getLfaFixturesForMatchday("2026-09-10")
  expect(two[0].sourceUpdatedAt).toBe(one[0].sourceUpdatedAt)
})
