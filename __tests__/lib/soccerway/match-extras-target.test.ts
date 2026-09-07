// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * getMatchExtras 의 원장 규율 (2026-09-07).
 *  - 22구단 밖 경기는 해석에 실패해도 `resolve` 행을 남기지 않는다 — 관제 카드가
 *    "고칠 것"과 "원래 안 만드는 것"을 합산하던 오염의 뿌리.
 *  - 스탯은 대상 구단과 무관하게 계속 해석한다.
 */
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  record: vi.fn(),
  resolve: vi.fn(),
  game: { league_code: "EPL", home_team_name: "아스널", away_team_name: "첼시" },
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/news/notation", () => ({ findUniqueRomanizedMatch: vi.fn() }))
vi.mock("@/lib/llm/usage-log", () => ({ logUsage: vi.fn(), logUsageFailure: vi.fn() }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: vi.fn(), lookupLfaDayEntry: vi.fn() }))
vi.mock("@/lib/soccerway/report-attempts", () => ({ recordReportAttempt: mocks.record }))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: vi.fn(),
  cachedPersons: vi.fn(),
  cachedSquadPairs: vi.fn(),
  resolveMatchEvent: mocks.resolve,
}))
vi.mock("@/lib/motm/ft-evidence", () => ({ lfaDetailRow: () => ({ finished: false }) }))

import { getMatchExtras } from "@/lib/soccerway/match-extras"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue(null)
  mocks.from.mockImplementation((table: string) => {
    let columns = ""
    const query: any = {
      select: (value: string) => {
        columns = value
        return query
      },
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "match_reports") return Promise.resolve(resolve({ data: null, error: null }))
        if (table === "betman_games" && columns === "id")
          return Promise.resolve(resolve({ data: [{ id: "game" }], error: null }))
        if (table === "betman_games")
          return Promise.resolve(
            resolve({ data: { ...mocks.game, match_time: "2026-09-06T18:00:00Z" }, error: null })
          )
        return Promise.resolve(resolve({ data: [], error: null }))
      },
    }
    return query
  })
})

describe("getMatchExtras — 대상 구단 판정이 원장 기록보다 먼저다", () => {
  it("22구단 밖 경기는 해석 실패를 원장에 남기지 않는다", async () => {
    mocks.game = { league_code: "라리가", home_team_name: "말라가", away_team_name: "레반테" }
    expect(await getMatchExtras("game")).toEqual({ stats: null, report: null })
    expect(mocks.resolve).toHaveBeenCalledWith("game") // 스탯 해석은 그대로 시도한다
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("대상 구단 경기의 해석 실패는 resolve 로 남긴다", async () => {
    mocks.game = { league_code: "EPL", home_team_name: "아스널", away_team_name: "첼시" }
    await getMatchExtras("game")
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
      "game",
      null,
      "resolve",
      expect.stringContaining("해석 결과 없음")
    )
  })

  it("대상 리그 밖이면 해석도 원장도 없다", async () => {
    mocks.game = { league_code: "K리그1", home_team_name: "아스널", away_team_name: "첼시" }
    expect(await getMatchExtras("game")).toEqual({ stats: null, report: null })
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })
})
