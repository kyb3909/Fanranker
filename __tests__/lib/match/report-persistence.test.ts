// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  record: vi.fn(),
  resolve: vi.fn(),
  draft: vi.fn(),
  targets: vi.fn(),
  report: { title: "첼시 2-1 리버풀", paragraphs: ["검증된 경기 요약"] },
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/match/get-fixtures", () => ({
  todayKst: () => "2026-09-07",
  getFixturesForDay: async (day: string) =>
    day === "2026-09-07"
      ? [
          {
            gameId: "game",
            leagueCode: "EPL",
            homeTeam: "첼시",
            awayTeam: "리버풀",
            matchTime: new Date(Date.now() - 3 * 3600_000).toISOString(),
            lfaFinished: true,
          },
        ]
      : [],
}))
// A verified draft is durable in the ledger, independent of the Next data cache.
vi.mock("@/lib/soccerway/report-work", () => ({
  claimReportWork: async () => ({ token: "token", work: { context: null } }),
  releaseReportWork: vi.fn(),
  saveReportWork: vi.fn(),
  loadReportDraft: mocks.draft,
  listReportRetryTargets: mocks.targets,
}))
vi.mock("next/cache", () => ({
  unstable_cache: () => async () => null,
}))
vi.mock("@/lib/news/notation", () => ({ findUniqueRomanizedMatch: vi.fn() }))
vi.mock("@/lib/llm/usage-log", () => ({ logUsage: vi.fn(), logUsageFailure: vi.fn() }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: vi.fn(), lookupLfaDayEntry: vi.fn() }))
vi.mock("@/lib/soccerway/report-attempts", () => ({
  recordReportAttempt: mocks.record,
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: vi.fn(),
  cachedPersons: vi.fn(),
  cachedSquadPairs: vi.fn(),
  resolveMatchEvent: mocks.resolve,
}))
vi.mock("@/lib/motm/ft-evidence", () => ({
  lfaDetailRow: () => ({ finished: true, homeScore: 2, awayScore: 1 }),
}))

import { GET } from "@/app/api/cron/match-reports/route"
import { numbersGate } from "@/lib/soccerway/match-extras"

it("accepts numbers in supplied club names while rejecting invented match statistics", () => {
  const sources = {
    paragraphs: [],
    events: [],
    stats: null,
    score: "1-4",
    teams: ["제노아", "코모1907"],
  }
  expect(numbersGate({ title: "코모1907, 4-1 승리", paragraphs: [] }, sources).ok).toBe(true)
  expect(numbersGate({ title: "코모1907, 슈팅 99개", paragraphs: [] }, sources)).toEqual({
    ok: false,
    rogue: ["99"],
  })
})

let writeFails: boolean
let readFails: boolean
let stored: typeof mocks.report | null
let writes: number
beforeEach(() => {
  vi.clearAllMocks()
  writeFails = false
  readFails = false
  stored = null
  writes = 0
  mocks.draft.mockResolvedValue({ event_id: "event", draft: mocks.report })
  mocks.targets.mockResolvedValue([])
  mocks.from.mockImplementation((table: string) => {
    let columns = ""
    let head = false
    const query: any = {
      select: (value: string, options?: { head?: boolean }) => {
        columns = value
        head = options?.head ?? false
        return query
      },
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      upsert: async (row: typeof mocks.report) => {
        writes++
        if (writeFails) return { error: { code: "XX000" } }
        stored = { title: row.title, paragraphs: row.paragraphs }
        return { error: null }
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "match_reports")
          return Promise.resolve(
            resolve({
              data: head ? null : stored,
              count: stored ? 1 : 0,
              error: readFails ? { code: "08006" } : null,
            })
          )
        const data =
          table === "match_details_cache"
            ? [{}]
            : columns === "id"
              ? [{ id: "game" }]
              : {
                  league_code: "EPL",
                  home_team_name: "첼시",
                  away_team_name: "리버풀",
                  match_time: "2026-09-06T18:00:00Z",
                }
        return Promise.resolve(resolve({ data, error: null }))
      },
    }
    return query
  })
})
const run = () => GET(new NextRequest("http://localhost/api/cron/match-reports"))

it("reports a failed write as 503, then stores the preserved draft without resolve/compose/verify", async () => {
  writeFails = true
  const failed = await run()
  expect(failed.status).toBe(503)
  expect(await failed.json()).toMatchObject({
    made: 0,
    success: false,
    errors: [{ gameId: "game", message: "match-report-write:XX000" }],
  })
  expect(stored).toBeNull()
  expect(mocks.record).toHaveBeenCalledWith("game", "event", "store", expect.any(String))

  writeFails = false
  const recovered = await run()
  expect(recovered.status).toBe(200)
  expect(await recovered.json()).toMatchObject({ made: 1, success: true })
  expect(stored).toEqual(mocks.report)
  expect(writes).toBe(2)
  expect(mocks.resolve).not.toHaveBeenCalled()

  expect(await (await run()).json()).toMatchObject({ made: 0, alreadyStored: 1 })
  expect(writes).toBe(2)
})

it("includes a retained draft outside the 24-hour fixture window", async () => {
  mocks.targets.mockResolvedValue([{ gameId: "game", homeTeam: "첼시", awayTeam: "리버풀" }])
  expect(await (await run()).json()).toMatchObject({ candidates: 1, made: 1 })
  expect(mocks.resolve).not.toHaveBeenCalled()
})

it("does not treat a report lookup error as an existing report or regenerate it", async () => {
  readFails = true
  const response = await run()
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({
    made: 0,
    alreadyStored: 0,
    errors: [{ gameId: "game", message: "match-report-read:08006" }],
  })
  expect(writes).toBe(0)
})
