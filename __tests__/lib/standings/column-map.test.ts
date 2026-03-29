import { describe, it, expect } from "vitest"
import { mapRowToStandings, mapRowsToStandings } from "@/lib/standings/column-map"
import type { StandingsRow } from "@/lib/standings/column-map"

describe("mapRowToStandings", () => {
  describe("Korean column names", () => {
    it("maps standard Korean column names", () => {
      const row = {
        팀명: "FC서울",
        경기: 10,
        승점: 22,
        골득실: 5,
        승: 7,
        패: 2,
        무: 1,
      }
      const result = mapRowToStandings(row)
      expect(result).toEqual<StandingsRow>({
        teamName: "FC서울",
        played: 10,
        points: 22,
        goalDiff: 5,
        wins: 7,
        losses: 2,
        draws: 1,
        group: "",
        division: "",
      })
    })

    it("maps alternative Korean column names", () => {
      const row = {
        팀: "삼성",
        경기수: "144",
        승점수: "0",
        득실차: "-10",
        승: "80",
        패: "64",
        무: "0",
      }
      const result = mapRowToStandings(row)
      expect(result.teamName).toBe("삼성")
      expect(result.played).toBe(144)
      expect(result.goalDiff).toBe(-10)
      expect(result.wins).toBe(80)
      expect(result.losses).toBe(64)
    })
  })

  describe("English column names", () => {
    it("maps standard English column names", () => {
      const row = {
        team: "Manchester United",
        played: 38,
        points: 75,
        goalDiff: 28,
        wins: 23,
        losses: 7,
        draws: 8,
        group: "Premier League",
        division: "",
      }
      const result = mapRowToStandings(row)
      expect(result.teamName).toBe("Manchester United")
      expect(result.played).toBe(38)
      expect(result.points).toBe(75)
      expect(result.goalDiff).toBe(28)
      expect(result.wins).toBe(23)
      expect(result.losses).toBe(7)
      expect(result.draws).toBe(8)
      expect(result.group).toBe("Premier League")
    })

    it("maps abbreviated English column names", () => {
      const row = {
        Team: "Lakers",
        GP: 82,
        PTS: 110,
        GD: 0,
        W: 50,
        L: 32,
        D: 0,
        conf: "WESTERN",
        div: "Pacific",
      }
      const result = mapRowToStandings(row)
      expect(result.teamName).toBe("Lakers")
      expect(result.played).toBe(82)
      expect(result.points).toBe(110)
      expect(result.wins).toBe(50)
      expect(result.losses).toBe(32)
      expect(result.group).toBe("WESTERN")
      expect(result.division).toBe("Pacific")
    })
  })

  describe("fallback behavior", () => {
    it("falls back to first column value when no team key is found", () => {
      const row = { 순위: "1", unknown_col: "Mystery Team", 경기: 10 }
      const result = mapRowToStandings(row)
      // Falls back to first key value
      expect(result.teamName).toBe("1")
    })

    it("returns 0 for missing numeric columns", () => {
      const row = { 팀명: "EmptyTeam" }
      const result = mapRowToStandings(row)
      expect(result.played).toBe(0)
      expect(result.points).toBe(0)
      expect(result.goalDiff).toBe(0)
      expect(result.wins).toBe(0)
      expect(result.losses).toBe(0)
      expect(result.draws).toBe(0)
    })

    it("returns empty string for missing string columns", () => {
      const row = { 팀명: "TestTeam" }
      const result = mapRowToStandings(row)
      expect(result.group).toBe("")
      expect(result.division).toBe("")
    })
  })

  describe("string-to-number conversion", () => {
    it("converts string numbers to numeric values", () => {
      const row = {
        팀명: "TeamA",
        경기: "30",
        승점: "55",
        골득실: "+12",
        승: "17",
        패: "8",
        무: "5",
      }
      const result = mapRowToStandings(row)
      expect(result.played).toBe(30)
      expect(result.points).toBe(55)
      expect(result.goalDiff).toBe(12)
      expect(result.wins).toBe(17)
      expect(result.losses).toBe(8)
      expect(result.draws).toBe(5)
    })

    it("strips non-numeric characters from values", () => {
      const row = {
        팀명: "TeamB",
        경기: "30경기",
        승점: "55점",
      }
      const result = mapRowToStandings(row)
      expect(result.played).toBe(30)
      expect(result.points).toBe(55)
    })

    it("handles negative values", () => {
      const row = { 팀명: "TeamC", 골득실: "-15" }
      const result = mapRowToStandings(row)
      expect(result.goalDiff).toBe(-15)
    })

    it("returns 0 for empty string values", () => {
      const row = { 팀명: "TeamD", 경기: "", 승점: "" }
      const result = mapRowToStandings(row)
      expect(result.played).toBe(0)
      expect(result.points).toBe(0)
    })
  })

  describe("whitespace handling", () => {
    it("trims whitespace from string values", () => {
      const row = {
        팀명: "  FC Seoul  ",
        conference: "  EASTERN  ",
        div: "  Atlantic  ",
      }
      const result = mapRowToStandings(row)
      expect(result.teamName).toBe("FC Seoul")
      expect(result.group).toBe("EASTERN")
      expect(result.division).toBe("Atlantic")
    })
  })
})

describe("mapRowsToStandings", () => {
  it("maps an array of rows", () => {
    const rows = [
      { 팀명: "TeamA", 승: 10, 패: 2, 무: 3 },
      { 팀명: "TeamB", 승: 8, 패: 4, 무: 3 },
      { 팀명: "TeamC", 승: 6, 패: 6, 무: 3 },
    ]
    const result = mapRowsToStandings(rows)
    expect(result).toHaveLength(3)
    expect(result[0].teamName).toBe("TeamA")
    expect(result[1].teamName).toBe("TeamB")
    expect(result[2].teamName).toBe("TeamC")
  })

  it("returns empty array for empty input", () => {
    expect(mapRowsToStandings([])).toEqual([])
  })

  it("each row has the full StandingsRow shape", () => {
    const rows = [{ 팀: "Solo" }]
    const result = mapRowsToStandings(rows)
    expect(result).toHaveLength(1)
    const row = result[0]
    expect(row).toHaveProperty("teamName")
    expect(row).toHaveProperty("played")
    expect(row).toHaveProperty("points")
    expect(row).toHaveProperty("goalDiff")
    expect(row).toHaveProperty("wins")
    expect(row).toHaveProperty("losses")
    expect(row).toHaveProperty("draws")
    expect(row).toHaveProperty("group")
    expect(row).toHaveProperty("division")
  })
})
