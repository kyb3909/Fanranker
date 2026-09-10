import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { periodMarkets } from "./__fixtures__/period-markets"

const m = vi.hoisted(() => ({
  games: [] as Record<string, unknown>[],
  checks: [] as Record<string, unknown>[],
  writes: [] as Record<string, unknown>[],
  deleted: [] as string[],
  failScope: false,
  notify: vi.fn(),
  index: vi.fn(),
  client: {} as any,
}))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: m.index, lookupLfaDayEntry: () => null }))
vi.mock("@/lib/discord-notify", () => ({ notifyDiscordOps: m.notify }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => m.client }))
vi.mock("@/lib/betman/daily-round", () => ({
  getTodayDailyId: () => "2026-09-11",
  getDailyWindow: () => ({
    start: new Date("2026-09-10T00:00Z"),
    end: new Date("2026-09-12T00:00Z"),
    dailyId: "2026-09-10",
  }),
  formatDailyIdLabel: () => "test",
  getBetCloseAt: () => "2026-09-12T00:00Z",
  getBettingWindowStatus: () => "open",
  getGameBetDeadline: () => new Date("2026-09-12T00:00Z"),
}))
import { crosscheckFootballResults } from "@/lib/betman/result-crosscheck"
import { buildGamesPayload } from "@/lib/betman/games-payload"

function client() {
  return {
    from(table: string) {
      let filters: Array<(r: Record<string, any>) => boolean> = []
      let start = 0,
        end = Infinity,
        operation = "read",
        paged = false
      const result = () => {
        const source =
          table === "betman_games"
            ? m.games
            : table === "betman_result_checks"
              ? m.checks
              : table === "match_details_cache"
                ? m.games.map((g) => ({
                    game_id: g.id,
                    finished: true,
                    payload: { homeScore: 1, awayScore: 1 },
                  }))
                : []
        const rows = source.filter((r) => filters.every((f) => f(r))).slice(start, end + 1)
        if (operation === "delete") m.deleted.push(...rows.map((r) => String(r.game_id)))
        return { data: rows, error: paged && m.failScope ? { message: "offline" } : null }
      }
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v)
          return q
        },
        neq: (k: string, v: unknown) => {
          filters.push((r) => r[k] !== v)
          return q
        },
        not: (k: string) => {
          filters.push((r) => r[k] != null)
          return q
        },
        in: (k: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[k]))
          return q
        },
        gte: (k: string, v: string) => {
          filters.push((r) => r[k] >= v)
          return q
        },
        gt: (k: string, v: string) => {
          filters.push((r) => r[k] > v)
          return q
        },
        lte: (k: string, v: string) => {
          filters.push((r) => r[k] <= v)
          return q
        },
        range: (a: number, b: number) => {
          start = a
          end = b
          paged = true
          return q
        },
        limit: (n: number) => {
          end = n - 1
          return q
        },
        maybeSingle: async () => ({ data: null, error: null }),
        delete: () => {
          operation = "delete"
          return q
        },
        update: () => q,
        upsert: async (rows: Record<string, unknown>[]) => {
          m.writes.push(...rows)
          return { error: null }
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      }
      return q
    },
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-11T00:00Z"))
  vi.clearAllMocks()
  m.games = periodMarkets.map((g) => ({ ...g }))
  m.checks = [{ game_id: "598", verdict: "mismatch", alerted_at: "2026-09-10" }]
  m.writes = []
  m.deleted = []
  m.failScope = false
  m.client = client()
})
afterEach(() => vi.useRealTimers())

describe("전반전 제외의 실제 호출 경로", () => {
  it("1–1 / 1.5 전반 오경보를 지우고 풀타임 4개만 검증한다", async () => {
    expect(await crosscheckFootballResults(m.client)).toMatchObject({
      scanned: 4,
      match: 4,
      mismatch: 0,
      alerted: 0,
    })
    expect(m.deleted).toEqual(["598"])
    expect(m.writes.map((r) => r.game_id)).toEqual(["591", "592", "593", "594"])
    expect(m.notify).not.toHaveBeenCalled()
    expect(m.index).not.toHaveBeenCalled()
  })
  it("SUM 상태/결과가 아직 미확정이어도 문맥에 포함해 전반을 제외한다", async () => {
    m.games[4] = { ...m.games[4], status: "scheduled", result: null }
    expect((await crosscheckFootballResults(m.client)).mismatch).toBe(0)
    expect(m.writes.map((r) => r.game_id)).not.toContain("598")
  })
  it("풀타임의 실제 결과 불일치까지 숨기지 않는다", async () => {
    m.games[3] = { ...m.games[3], result: "over" }
    expect(await crosscheckFootballResults(m.client)).toMatchObject({ mismatch: 1, alerted: 1 })
    expect(m.writes.find((r) => r.game_id === "594")?.verdict).toBe("mismatch")
    expect(m.notify).toHaveBeenCalledOnce()
  })
  it("문맥 조회 실패 시 기존 검증을 삭제하거나 새 경보를 만들지 않는다", async () => {
    m.failScope = true
    await expect(crosscheckFootballResults(m.client)).rejects.toThrow("market scope")
    expect(m.deleted).toEqual([])
    expect(m.writes).toEqual([])
    expect(m.notify).not.toHaveBeenCalled()
  })
  it("화면의 언더오버 필터를 선택해도 SUM 문맥을 잃지 않는다", async () => {
    const payload = await buildGamesPayload({ date: "2026-09-10", gameType: "언더오버" })
    expect(payload.games.map((g) => g.id)).toEqual(["594"])
    expect(payload.groupedGames.flatMap((g) => g.games.map((r) => r.id))).toEqual(["594"])
  })
  it("500행 다음 페이지에 있는 전반 경계도 화면 분류에 포함한다", async () => {
    m.games = [
      ...Array.from({ length: 500 }, (_, i) => ({
        ...periodMarkets[4],
        id: `filler-${i}`,
        round_id: `other-${i}`,
      })),
      ...m.games,
    ]
    const payload = await buildGamesPayload({ date: "2026-09-10", gameType: "언더오버" })
    expect(payload.games.map((g) => g.id)).toEqual(["594"])
  })
  it("오늘 예정 경기만 표시할 때도 완료된 SUM 행으로 전반을 제외한다", async () => {
    m.games = m.games.map((g) => ({
      ...g,
      status: g.game_type === "SUM" ? "completed" : "scheduled",
    }))
    const payload = await buildGamesPayload({ date: "2026-09-11", gameType: "언더오버" })
    expect(payload.games.map((g) => g.id)).toEqual(["594"])
  })
})
