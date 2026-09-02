import { describe, expect, it } from "vitest"
import {
  isMatchPageLeague,
  leagueLabel,
  matchPageLeaguesAt,
  TRIAL_MATCH_PAGE_LEAGUES,
} from "@/lib/match/leagues"
import { lfaLeagueId } from "@/lib/lfa/leagues"

describe("LFA 크레딧 게이트 = 화이트리스트 한 곳 (복사본 폐지)", () => {
  it("매치센터 대상 리그는 LFA id 가 나오고, 대상 밖은 null", () => {
    expect(lfaLeagueId("EPL")).not.toBeNull()
    expect(lfaLeagueId("MLS")).toBeNull()
    expect(lfaLeagueId("K리그1")).toBeNull()
  })

  it("시험 리그는 만료 전엔 LFA id 가 나온다 (스탯·라인업이 비지 않게)", () => {
    const trial = TRIAL_MATCH_PAGE_LEAGUES[0]
    if (!trial || new Date(trial.until).getTime() <= Date.now()) return
    expect(lfaLeagueId(trial.code)).not.toBeNull()
    expect(leagueLabel(trial.code)).not.toBe(trial.code)
  })
})

/**
 * 기간 한정 시험 리그 (2026-09-02). 시험은 만료일이 지나면 스스로 빠져야 한다 —
 * "이번 주만" 이 사람 기억에 매달리면 다음 주에도 열려 있다.
 */
describe("시험 리그 — 만료 전에만 대상", () => {
  const trial = TRIAL_MATCH_PAGE_LEAGUES[0]

  it("상시 리그는 언제나 대상이다", () => {
    expect(matchPageLeaguesAt(0).has("EPL")).toBe(true)
    expect(matchPageLeaguesAt(Number.MAX_SAFE_INTEGER).has("UCL")).toBe(true)
  })

  it("만료 1분 전엔 대상, 만료 시각부터는 아니다", () => {
    if (!trial) return
    const until = new Date(trial.until).getTime()
    expect(matchPageLeaguesAt(until - 60_000).has(trial.code)).toBe(true)
    expect(matchPageLeaguesAt(until).has(trial.code)).toBe(false)
    expect(matchPageLeaguesAt(until + 24 * 3600_000).has(trial.code)).toBe(false)
  })

  it("시험 항목엔 만료일과 사유가 있다 — 만료 없는 시험은 상시다", () => {
    for (const t of TRIAL_MATCH_PAGE_LEAGUES) {
      expect(Number.isFinite(new Date(t.until).getTime()), t.code).toBe(true)
      expect(t.why.length, t.code).toBeGreaterThan(5)
    }
  })

  it("isMatchPageLeague 는 상시 리그를 알고, 모르는 코드는 거른다", () => {
    expect(isMatchPageLeague("EPL")).toBe(true)
    expect(isMatchPageLeague("MLS")).toBe(false)
    expect(isMatchPageLeague(null)).toBe(false)
  })
})
