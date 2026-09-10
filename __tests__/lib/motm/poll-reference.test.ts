import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  identity: vi.fn(),
  fail: false,
  rows: [] as Record<string, unknown>[],
}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/match/sibling-ids", () => ({ getMatchIdentity: m.identity }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async (column: string, ids: string[]) => ({
            data: m.rows.filter((r) => ids.includes(String(r[column]))),
            error: m.fail ? { message: "offline" } : null,
          }),
        }),
      }),
    }),
  }),
}))
import { getMotmPollForGame } from "@/lib/motm/poll"

describe("공통 경기 참조로 MOTM 조회", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.fail = false
    m.identity.mockResolvedValue({
      gameIds: ["betman", "lfa"],
      lfaMatchId: "provider",
      pollKeys: ["old-key", "lfa_provider"],
    })
    m.rows = [
      {
        id: "old-poll",
        game_id: "betman",
        match_key: "old-key",
        is_active: false,
        closes_at: null,
        created_at: "2026-09-01",
      },
    ]
  })
  it("Betman과 LFA URL 모두 기존 투표를 찾는다", async () => {
    expect(await getMotmPollForGame("betman")).toEqual({ pollId: "old-poll", closed: true })
    expect(await getMotmPollForGame("lfa")).toEqual({ pollId: "old-poll", closed: true })
    expect(m.identity).toHaveBeenCalledWith(expect.anything(), "lfa", { strict: true })
  })
  it("이전 중복 자료가 있으면 URL과 무관하게 먼저 만들어진 투표를 고른다", async () => {
    m.rows.unshift({
      id: "new-poll",
      game_id: "lfa",
      match_key: "lfa_provider",
      is_active: true,
      closes_at: null,
      created_at: "2026-09-02",
    })
    expect((await getMotmPollForGame("lfa"))?.pollId).toBe("old-poll")
  })
  it("읽기 장애를 투표 없음으로 반환하지 않는다", async () => {
    m.fail = true
    await expect(getMotmPollForGame("lfa")).rejects.toThrow("motm-reference:offline")
    m.fail = false
    expect((await getMotmPollForGame("lfa"))?.pollId).toBe("old-poll")
  })
})
