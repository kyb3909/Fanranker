// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { ReportContext, ReportWork } from "@/lib/soccerway/report-work"

const mocks = vi.hoisted(() => ({
  work: null as unknown as ReportWork,
  attempts: [] as {
    id: number
    compose_index: number
    version: string
    compose_called: boolean
    verify_called: boolean
    verify_passed: boolean | null
    stage: string
  }[],
  names: [] as { romanized: string; preferred_ko: string }[],
  claim: vi.fn(),
  save: vi.fn(),
  reserve: vi.fn(),
  finish: vi.fn(),
  hold: vi.fn(),
  resolve: vi.fn(),
  lineup: vi.fn(),
  feed: vi.fn(),
  source: vi.fn(),
  fetch: vi.fn(),
  record: vi.fn(),
  from: vi.fn(),
  loadNames: vi.fn(),
  badCompose: false,
  emptyCompose: false,
  dbScore: [2, 1],
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown, keys: string[]) =>
    keys[0].startsWith("match-report-source")
      ? mocks.source
      : keys[0] === "match-stats"
        ? async () => null
        : fn,
}))
vi.mock("@/lib/soccerway/report-name-sources", () => ({
  loadReportNameSources: mocks.loadNames,
  getReportNameSources: mocks.loadNames,
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: mocks.lineup,
  resolveMatchEvent: mocks.resolve,
}))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: mocks.feed, lookupLfaDayEntry: vi.fn() }))
vi.mock("@/lib/llm/usage-log", () => ({ logUsage: vi.fn(), logUsageFailure: vi.fn() }))
vi.mock("@/lib/soccerway/report-attempts", () => ({ recordReportAttempt: mocks.record }))
vi.mock("@/lib/soccerway/report-work", async (original) => ({
  ...(await original<typeof import("@/lib/soccerway/report-work")>()),
  claimReportWork: mocks.claim,
  releaseReportWork: vi.fn(),
  saveReportWork: mocks.save,
  loadReportDraft: async () => null,
  reserveReportCompose: mocks.reserve,
  markReportCall: async (id: number, field: "compose_called" | "verify_called") => {
    mocks.attempts.find((a) => a.id === id)![field] = true
  },
  finishReportCompose: mocks.finish,
  holdReportDictionary: mocks.hold,
}))

import {
  generateMatchReport,
  getMatchExtras,
  PROMPT_VERSION,
  VERIFY_RULE_VERSION,
  refreshReportSource,
} from "@/lib/soccerway/match-extras"
import {
  normalizeReportArticle,
  reportEventNames,
  reportInputVersion,
} from "@/lib/soccerway/report-budget"
import { reportRetryEligible } from "@/lib/soccerway/report-work"

const known = { romanized: "Cole Palmer", preferred_ko: "콜 팔머" }
const article = {
  id: "article",
  slug: "arsenal-chelsea",
  title: "Arsenal 2-1 Chelsea",
  publishedAtMs: 1,
}
const event = (type: string, name: string) => ({
  type,
  players: [name],
  minute: "12",
  team: "away" as const,
  detail: name + " scored.",
})
const composeCalls = () =>
  mocks.fetch.mock.calls.filter(([, opts]) =>
    JSON.parse(opts.body).messages[0].content.includes("쓰는 에디터")
  )
const run = () =>
  generateMatchReport("event", "game", "아스널", "첼시", "2-1", "https://example.com", 1)
const version = (names = [known.preferred_ko]) =>
  reportInputVersion({
    paragraphs: mocks.work.context!.paragraphs,
    score: "2-1",
    promptVersion: PROMPT_VERSION,
    verifyRuleVersion: VERIFY_RULE_VERSION,
    names,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("OPENAI_API_KEY", "unit-test-key")
  vi.stubGlobal("fetch", mocks.fetch)
  mocks.attempts = []
  mocks.names = [known]
  mocks.badCompose = false
  mocks.emptyCompose = false
  mocks.dbScore = [2, 1]
  const context: ReportContext = {
    eventId: "event",
    homeTeam: "아스널",
    awayTeam: "첼시",
    finalScore: "2-1",
    candidateUrl: "https://example.com",
    kickoffMs: Date.now() - 3 * 86400_000,
    article,
    paragraphs: ["Cole Palmer scored for Chelsea. Arsenal won 2-1."],
    extracted: { score: "2-1", events: [event("goal", known.romanized)] },
    lineup: { status: "none" },
    stats: null,
  }
  mocks.work = {
    game_id: "game",
    event_id: "event",
    context,
    input_version: null,
    status: "ready",
    reason: null,
    missing_names: [],
    held_at: null,
    lease_until: null,
    finished_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
    manual_resume: false,
    updated_at: new Date().toISOString(),
  }
  mocks.claim.mockImplementation(async () => ({
    token: "token",
    work: structuredClone(mocks.work),
  }))
  mocks.save.mockImplementation(async (_id, _token, patch) => {
    Object.assign(mocks.work, patch)
  })
  mocks.loadNames.mockImplementation(async () => ({ persons: mocks.names, squads: [] }))
  mocks.hold.mockImplementation(async (_id, _lease, v, missing) => {
    Object.assign(mocks.work, { status: "dictionary", input_version: v, missing_names: missing })
  })
  mocks.reserve.mockImplementation(async (_id, _token, v) => {
    const n = mocks.attempts.filter((a) => a.version === v).length
    if (n >= 6) {
      mocks.work.status = "held"
      return { status: "held" }
    }
    const a = {
      id: mocks.attempts.length + 1,
      compose_index: n + 1,
      version: v,
      compose_called: false,
      verify_called: false,
      verify_passed: null,
      stage: "reserve",
    }
    mocks.attempts.push(a)
    return { status: "reserved", attempt: a }
  })
  mocks.finish.mockImplementation(async (_game, _token, id, stage, _reason, passed) => {
    const a = mocks.attempts.find((a) => a.id === id)!
    Object.assign(a, { stage, verify_passed: passed })
    if (passed) mocks.work.status = "draft"
    else if (a.compose_index === 6) mocks.work.status = "held"
  })
  mocks.fetch.mockImplementation(async (_url, opts) => {
    const system = JSON.parse(opts.body).messages[0].content as string
    const value = system.includes("추출하는 파서")
      ? { score: "2-1", events: [event("goal", "Unknown Player")] }
      : system.includes("쓰는 에디터")
        ? mocks.emptyCompose
          ? null
          : {
              title: "아스널 2-1 첼시",
              paragraphs: [mocks.badCompose ? "Unknown Player scored." : "콜 팔머가 득점했다."],
            }
        : { pass: true, problems: [] }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: value ? JSON.stringify(value) : null } }] })
    )
  })
  mocks.from.mockImplementation((table: string) => {
    let columns = ""
    const q: any = {
      select: (s: string) => {
        columns = s
        return q
      },
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => q,
      then: (resolve: (data: unknown) => unknown) =>
        Promise.resolve(
          resolve({
            error: null,
            data:
              table === "match_reports" || table === "lfa_fixtures"
                ? null
                : table === "match_details_cache"
                  ? [
                      {
                        finished: true,
                        payload: { homeScore: mocks.dbScore[0], awayScore: mocks.dbScore[1] },
                      },
                    ]
                  : columns === "id"
                    ? [{ id: "game" }]
                    : {
                        league_code: "EPL",
                        home_team_name: "아스널",
                        away_team_name: "첼시",
                        match_time: "2026-09-06T18:00:00Z",
                      },
          })
        ),
    }
    return q
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("dictionary and allowlist", () => {
  // 2026-09-11 운영자: "리포트 영문 이름 나가도 괜찮아" — 사전 미등재 선수는 보류·생략이 아니라
  // 영문 원명 그대로 쓴다. 보류(dictionary) 경로는 더 이상 타지 않는다.
  it("does not hold on missing event names; compose receives them as original-spelling names", async () => {
    mocks.work.context!.extracted!.events.push(event("sub", "Karl Hein"))
    expect(await run()).not.toBeNull()
    expect(mocks.hold).not.toHaveBeenCalled()
    expect(mocks.work.missing_names).toEqual(["Karl Hein"])
    expect(mocks.work.status).not.toBe("dictionary")
    const payload = JSON.parse(JSON.parse(composeCalls()[0][1].body).messages[1].content)
    expect(payload.영문_그대로_쓸_이름).toEqual(["Karl Hein"])
    expect(payload.실명_사용_허용_목록).toEqual(["콜 팔머"])
  })
  it("persists extraction and never repeats it on retry", async () => {
    mocks.work.context!.extracted = null
    await run()
    await run()
    const parserCalls = mocks.fetch.mock.calls.filter(([, opts]) =>
      JSON.parse(opts.body).messages[0].content.includes("추출하는 파서")
    )
    expect(parserCalls).toHaveLength(1)
    expect(mocks.work.context!.extracted!.events[0].players).toEqual(["Unknown Player"])
  })
  it("a report written with an original-spelling name passes the Latin gate", async () => {
    mocks.work.context!.extracted!.events.push(event("goal", "Nico Paz"))
    mocks.badCompose = true // compose writes "Unknown Player scored." — not an allowed name
    expect(await run()).toBeNull()
    expect(mocks.attempts.every((a) => a.stage === "compose")).toBe(true)
    mocks.attempts = []
    mocks.badCompose = false
    mocks.fetch.mockImplementation(async (_url, opts) => {
      const system = JSON.parse(opts.body).messages[0].content as string
      const value = system.includes("추출하는 파서")
        ? { score: "2-1", events: [] }
        : system.includes("쓰는 에디터")
          ? {
              title: "아스널 2-1 첼시",
              paragraphs: ["Nico Paz가 득점했고 Paz의 두 번째 슛은 빗나갔다."],
            }
          : { pass: true, problems: [] }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] })
      )
    })
    expect(await run()).toMatchObject({ title: "아스널 2-1 첼시" })
  })
  it("optional note names do not block; compose receives the explicit allowed Korean names", async () => {
    mocks.work.context!.extracted!.events.push(event("note", "Optional Player"))
    expect(await run()).not.toBeNull()
    expect(mocks.hold).not.toHaveBeenCalled()
    const body = JSON.parse(composeCalls()[0][1].body)
    expect(body.messages[0].content).toContain("두 목록에 없는 선수가 필요한 부가 묘사는 생략")
    expect(JSON.parse(body.messages[1].content).실명_사용_허용_목록).toEqual(["콜 팔머"])
    expect(mocks.attempts[0]).toMatchObject({
      compose_called: true,
      verify_called: true,
      verify_passed: true,
      stage: "draft",
    })
    expect(mocks.work.context!.usageByAttempt?.["1"]?.compose?.model).toBe("gpt-5.1")
    expect(mocks.work.context!.usageByAttempt?.["1"]?.verify?.model).toBe("gpt-5.6-terra")
  })
  it("records which names went out in the original spelling and clears them once confirmed", async () => {
    mocks.work.context!.extracted!.events = [
      event("goal", "Karl Hein"),
      event("assist", "Nico Paz"),
    ]
    await run()
    expect(mocks.work.missing_names).toEqual(["Karl Hein", "Nico Paz"])
    expect(composeCalls()).toHaveLength(1)
    mocks.names = [
      { romanized: "Karl Hein", preferred_ko: "카를 하인" },
      { romanized: "Nico Paz", preferred_ko: "니코 파스" },
    ]
    await run()
    expect(mocks.work.missing_names).toEqual([])
  })
})

describe("version budget and retained inputs", () => {
  it("six compose-only failures consume six starts; no seventh starts", async () => {
    mocks.badCompose = true
    await run()
    await run()
    await run()
    expect(composeCalls()).toHaveLength(6)
    expect(mocks.work.status).toBe("held")
    expect(mocks.attempts.map((a) => a.compose_index)).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      mocks.attempts.every((a) => a.compose_called && !a.verify_called && a.verify_passed === null)
    ).toBe(true)
  })
  it("an empty compose response still closes and consumes its reservation", async () => {
    mocks.emptyCompose = true
    await run()
    expect(mocks.attempts[0]).toMatchObject({
      compose_called: true,
      verify_called: false,
      stage: "compose",
    })
  })
  it("same-input hold older than 24h performs DB checks only, without resolve, feed, source or LLM", async () => {
    mocks.work.status = "held"
    mocks.work.input_version = version()
    await getMatchExtras("game")
    expect(mocks.loadNames).toHaveBeenCalledOnce()
    for (const spy of [mocks.resolve, mocks.feed, mocks.source, mocks.lineup, mocks.fetch])
      expect(spy).not.toHaveBeenCalled()
  })
  it("a rule version change resumes an old hold at index one", async () => {
    mocks.work.status = "held"
    mocks.work.input_version = "old-rule-hash"
    await run()
    expect(mocks.attempts[0]).toMatchObject({ compose_index: 1, version: version() })
  })
  it("a changed DB score resumes an old hold without an external score lookup", async () => {
    mocks.work.status = "held"
    mocks.work.input_version = version()
    mocks.dbScore = [3, 1]
    await getMatchExtras("game")
    expect(mocks.reserve).toHaveBeenCalled()
    expect(mocks.reserve.mock.calls[0][2]).not.toBe(version())
    expect(mocks.feed).not.toHaveBeenCalled()
  })
  it("automatic held checks cover seven days, but drafts can still be stored later", () => {
    expect(reportRetryEligible(mocks.work)).toBe(true)
    mocks.work.finished_at = new Date(Date.now() - 8 * 86400_000).toISOString()
    expect(reportRetryEligible(mocks.work)).toBe(false)
    mocks.work.status = "draft"
    expect(reportRetryEligible(mocks.work)).toBe(true)
  })
  it("an explicit manual resume can process a hold beyond seven days using the same reservation", async () => {
    mocks.work.finished_at = new Date(Date.now() - 8 * 86400_000).toISOString()
    mocks.badCompose = true
    await getMatchExtras("game")
    expect(mocks.reserve).not.toHaveBeenCalled()
    mocks.work.manual_resume = true
    await getMatchExtras("game")
    expect(composeCalls()).toHaveLength(3)
  })
})

describe("manual source refresh", () => {
  const long =
    "Cole Palmer scored for Chelsea, while Arsenal won the game with a late winning goal after a close contest."
  it("bypasses the fetch cache, preserves the old extraction if unchanged, and never calls an LLM", async () => {
    mocks.work.context!.paragraphs = [long, long]
    const extracted = mocks.work.context!.extracted
    mocks.fetch.mockResolvedValue(
      new Response(`<p> ${long} </p><p>${long.replace(/ /g, "  ")}</p>`)
    )
    expect(await refreshReportSource("game")).toBe(false)
    expect(mocks.work.context!.extracted).toEqual(extracted)
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("soccerway.com/news/"),
      expect.objectContaining({ cache: "no-store" })
    )
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
  it("changed evidence clears extraction for the next run without resetting the budget itself", async () => {
    mocks.work.input_version = "previous"
    mocks.fetch.mockResolvedValue(new Response(`<p>${long}</p><p>${long}</p>`))
    expect(await refreshReportSource("game")).toBe(true)
    expect(mocks.work.context!.extracted).toBeNull()
    expect(mocks.work.input_version).toBe("previous")
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
})

describe("stable input identity", () => {
  it("folds whitespace and removes ad/collection/copyright tails without deleting evidence", () => {
    const paragraphs = [
      "Cole   Palmer scored 2 goals.",
      "Advertisement",
      "Collected at: 2026-09-10",
      "Copyright 2026 Soccerway. All rights reserved.",
    ]
    expect(normalizeReportArticle(paragraphs)).toEqual(["Cole Palmer scored 2 goals."])
    const args = {
      score: "2-1",
      promptVersion: "p1",
      verifyRuleVersion: "v1",
      names: ["Cole Palmer"],
    }
    const a = reportInputVersion({ ...args, paragraphs })
    expect(a).toBe(reportInputVersion({ ...args, paragraphs: ["Cole Palmer scored 2 goals."] }))
    expect(a).not.toBe(reportInputVersion({ ...args, paragraphs, names: ["콜 팔머"] }))
    expect(a).not.toBe(reportInputVersion({ ...args, paragraphs, verifyRuleVersion: "v2" }))
  })
  it("required names include assists/cards/substitutions but exclude optional chance/note players", () => {
    const result = reportEventNames(
      [
        event("assist", "A"),
        event("red_card", "B"),
        event("sub", "C"),
        event("chance", "D"),
        event("note", "E"),
      ],
      () => null
    )
    expect(result.missing).toEqual(["A", "B", "C"])
  })
})
