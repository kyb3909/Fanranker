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
  list: vi.fn(),
  resolve: vi.fn(),
  generate: vi.fn(),
  game: { league_code: "EPL", home_team_name: "아스널", away_team_name: "첼시" },
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
// 리포트 체인(match-report-*)은 스파이로, 스탯은 빈 값으로 — 둘 다 바깥에 나가지 않는다
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown, keys: string[]) =>
    keys[0].startsWith("match-report")
      ? mocks.generate
      : keys[0] === "match-stats"
        ? async () => null
        : fn,
}))
vi.mock("@/lib/news/notation", () => ({ findUniqueRomanizedMatch: vi.fn() }))
vi.mock("@/lib/llm/usage-log", () => ({ logUsage: vi.fn(), logUsageFailure: vi.fn() }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: vi.fn(), lookupLfaDayEntry: vi.fn() }))
vi.mock("@/lib/soccerway/report-attempts", () => ({
  recordReportAttempt: mocks.record,
  listRecentReportAttempts: mocks.list,
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: vi.fn(),
  cachedPersons: vi.fn(),
  cachedSquadPairs: vi.fn(),
  resolveMatchEvent: mocks.resolve,
}))
vi.mock("@/lib/motm/ft-evidence", () => ({
  lfaDetailRow: (row: {
    finished?: boolean
    payload?: { homeScore?: number; awayScore?: number }
  }) => ({
    finished: row.finished === true,
    homeScore: row.payload?.homeScore ?? null,
    awayScore: row.payload?.awayScore ?? null,
  }),
}))

import { getMatchExtras } from "@/lib/soccerway/match-extras"

const resolved = {
  eventId: "event",
  homeTeam: "아스널",
  awayTeam: "첼시",
  homeScore: null,
  awayScore: null,
  leagueCode: "EPL",
  matchTime: "2026-09-06T18:00:00Z",
  candidateUrl: "https://example.com/",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue(null)
  mocks.list.mockResolvedValue([])
  mocks.generate.mockResolvedValue(null)
  mocks.game = { league_code: "EPL", home_team_name: "아스널", away_team_name: "첼시" }
  mocks.from.mockImplementation((table: string) => {
    let columns = ""
    let eqValue: unknown
    const query: any = {
      select: (value: string) => {
        columns = value
        return query
      },
      eq: (_k: string, v: unknown) => {
        eqValue = v
        return query
      },
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "match_reports") return Promise.resolve(resolve({ data: null, error: null }))
        if (table === "match_details_cache")
          return Promise.resolve(
            resolve({
              data: [{ finished: true, payload: { homeScore: 2, awayScore: 1 } }],
              error: null,
            })
          )
        // LFA 전용 등록 경기: "lfa-linked" 는 베트맨 "game" 에 연결, "lfa-only" 는 미연결
        if (table === "lfa_fixtures")
          return Promise.resolve(
            resolve({
              data:
                eqValue === "lfa-linked"
                  ? { id: "lfa-linked", betman_game_id: "game", lfa_match_id: "x" }
                  : eqValue === "lfa-only"
                    ? { id: "lfa-only", betman_game_id: null, lfa_match_id: "y" }
                    : null,
              error: null,
            })
          )
        if (table === "betman_games" && columns === "id")
          return Promise.resolve(resolve({ data: [{ id: "game" }], error: null }))
        if (table === "betman_games")
          return Promise.resolve(
            resolve({
              // 베트맨 행은 "game" 뿐 — LFA uuid 로 물으면 없다
              data:
                eqValue === "game" ? { ...mocks.game, match_time: "2026-09-06T18:00:00Z" } : null,
              error: null,
            })
          )
        return Promise.resolve(resolve({ data: [], error: null }))
      },
    }
    return query
  })
})

describe("getMatchExtras — LFA 전용 uuid 로 들어온 경우", () => {
  it("베트맨이 연결된 등록 경기는 연결된 베트맨 id 로 체인을 돈다 (원장도 그 id 아래)", async () => {
    await getMatchExtras("lfa-linked")
    expect(mocks.resolve).toHaveBeenCalledWith("game")
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
      "game",
      null,
      "resolve",
      expect.any(String)
    )
  })

  it("연결되지 않은 LFA 전용 경기는 대상이 아니다", async () => {
    expect(await getMatchExtras("lfa-only")).toEqual({ stats: null, report: null })
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })
})

describe("getMatchExtras — 같은 검증 실패를 되풀이하지 않는다", () => {
  const verify = (at: string) => ({ stage: "verify", attempted_at: at })

  it("24시간 안 검증 불합격 3회면 체인을 부르지 않고 held 를 한 번 남긴다", async () => {
    mocks.resolve.mockResolvedValue(resolved)
    mocks.list.mockResolvedValue([verify("03:00"), verify("02:00"), verify("01:00")])
    expect(await getMatchExtras("game")).toEqual({ stats: null, report: null })
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
      "game",
      "event",
      "held",
      expect.stringContaining("3회")
    )
  })

  it("마지막 행이 이미 held 면 다시 기록하지 않는다", async () => {
    mocks.resolve.mockResolvedValue(resolved)
    mocks.list.mockResolvedValue([
      { stage: "held", attempted_at: "04:00" },
      verify("03:00"),
      verify("02:00"),
      verify("01:00"),
    ])
    await getMatchExtras("game")
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("2회까지는 계속 시도한다", async () => {
    mocks.resolve.mockResolvedValue(resolved)
    mocks.list.mockResolvedValue([verify("02:00"), verify("01:00")])
    await getMatchExtras("game")
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.record).not.toHaveBeenCalledWith("game", "event", "held", expect.anything())
  })

  it("원장을 못 읽으면 이번 회차엔 체인을 돌리지 않는다 (비용 쪽으로 보수적)", async () => {
    mocks.resolve.mockResolvedValue(resolved)
    mocks.list.mockResolvedValue(null)
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await getMatchExtras("game")
    } finally {
      quiet.mockRestore()
    }
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it("대상 구단이 아니면 원장을 읽지도 않는다", async () => {
    mocks.game = { league_code: "라리가", home_team_name: "말라가", away_team_name: "레반테" }
    mocks.resolve.mockResolvedValue(resolved)
    await getMatchExtras("game")
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
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
