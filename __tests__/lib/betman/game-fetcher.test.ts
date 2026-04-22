/**
 * 2026-04 betman 사이트 개편 후 파서 회귀 테스트.
 * Fixture 는 실제 gmTs=260047 응답 (저장된 JSON).
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { parseGames, type BetmanGameData } from "@/lib/betman/game-fetcher"

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "gameInfoInq-260047.json"), "utf-8")
)
const DATA: BetmanGameData = {
  datas: FIXTURE.compSchedules.datas,
  keys: FIXTURE.compSchedules.keys,
}

describe("parseGames (keys-based)", () => {
  it("reads a reasonable number of games (fixture has 619 raw rows; ~66 승N패 skipped + all-zero-odds dropped)", () => {
    const games = parseGames(DATA, "round-x")
    expect(games.length).toBeGreaterThan(300)
    expect(games.length).toBeLessThanOrEqual(619)
  })

  it("tags round_id on every row", () => {
    const games = parseGames(DATA, "round-abc")
    for (const g of games) expect(g.round_id).toBe("round-abc")
  })

  it("classifies game_type into 4 allowed values (skips 승N패)", () => {
    const games = parseGames(DATA, "r")
    const types = new Set(games.map((g) => g.game_type))
    for (const t of types) {
      expect(["일반", "핸디캡", "언더오버", "SUM"]).toContain(t)
    }
  })

  it("populates home/away team names and sport label", () => {
    const games = parseGames(DATA, "r")
    const g = games.find((x) => x.sport === "야구") ?? games[0]
    expect(g.home_team_name).not.toBe("")
    expect(g.away_team_name).not.toBe("")
    expect(g.match_time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("normal game has home/away odds, no over/under or odd/even", () => {
    const games = parseGames(DATA, "r")
    const normal = games.find((g) => g.game_type === "일반" && g.home_win_odds !== null)
    expect(normal).toBeDefined()
    expect(normal!.home_win_odds).toBeGreaterThan(0)
    expect(normal!.away_win_odds).toBeGreaterThan(0)
    expect(normal!.over_odds).toBeNull()
    expect(normal!.under_odds).toBeNull()
    expect(normal!.odd_odds).toBeNull()
    expect(normal!.even_odds).toBeNull()
  })

  it("under/over game has over_odds + under_odds + over_under_line", () => {
    const games = parseGames(DATA, "r")
    const uo = games.find((g) => g.game_type === "언더오버")
    expect(uo).toBeDefined()
    expect(uo!.under_odds).toBeGreaterThan(0)
    expect(uo!.over_odds).toBeGreaterThan(0)
    expect(uo!.over_under_line).toBeGreaterThan(0)
    expect(uo!.home_win_odds).toBeNull()
  })

  it("SUM game has odd_odds + even_odds", () => {
    const games = parseGames(DATA, "r")
    const sum = games.find((g) => g.game_type === "SUM")
    expect(sum).toBeDefined()
    expect(sum!.odd_odds).toBeGreaterThan(0)
    expect(sum!.even_odds).toBeGreaterThan(0)
  })

  it("handicap game has handicap spread (non-null)", () => {
    const games = parseGames(DATA, "r")
    const hc = games.find((g) => g.game_type === "핸디캡")
    expect(hc).toBeDefined()
    expect(hc!.handicap).not.toBeNull()
    // 홈팀 기준 spread — 부호는 +/- 둘 다 가능
  })

  it("returns [] when keys array is missing required field", () => {
    const bad: BetmanGameData = {
      datas: DATA.datas,
      keys: DATA.keys.filter((k) => k !== "winAllot"),
    }
    expect(parseGames(bad, "r")).toEqual([])
  })
})
