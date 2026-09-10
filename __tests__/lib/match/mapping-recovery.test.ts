import { describe, expect, it } from "vitest"
import { matchLfaWithRecovery, teamIdIndex } from "@/lib/match/pair-fixtures"

const game = {
  homeTeam: "첼시",
  awayTeam: "리즈",
  leagueCode: "잉리그컵",
  matchTime: "2026-09-09T19:00:00Z",
}
const dict = new Map([
  ["첼시", "Chelsea"],
  ["리즈", "Leeds United"],
])
const candidate = (extra = {}) => ({
  ...game,
  homeTeam: "Chelsea",
  awayTeam: "Leeds United",
  matchTime: "2026-09-09T19:15:00Z",
  ...extra,
})

describe("bounded LFA mapping recovery", () => {
  it("recovers a 15-minute correction using both confirmed teams", () => {
    const c = candidate()
    expect(matchLfaWithRecovery(game, [c], dict)).toEqual({
      status: "matched",
      candidate: c,
      anchor: "both",
    })
  })
  it("uses provider team IDs despite different source spelling", () => {
    const ids = teamIdIndex([
      ["첼시", "home"],
      ["리즈", "away"],
    ])
    expect(
      matchLfaWithRecovery(
        game,
        [
          candidate({
            homeTeam: "unknown1",
            awayTeam: "unknown2",
            homeTeamId: "home",
            awayTeamId: "away",
          }),
        ],
        dict,
        ids
      ).status
    ).toBe("matched")
  })
  it.each([
    { awayTeam: "Unknown" },
    { homeTeam: "Leeds United", awayTeam: "Chelsea" },
    { leagueCode: "EPL" },
    { matchTime: "2026-09-09T19:31:00Z" },
    { matchTime: "2026-09-10T19:00:00Z" },
    { matchTime: "invalid" },
  ])("does not broaden identity evidence for %j", (extra) => {
    expect(matchLfaWithRecovery(game, [candidate(extra)], dict).candidate).toBeNull()
  })
  it("does not resolve multiple nearby matches by picking the closest", () => {
    expect(
      matchLfaWithRecovery(
        game,
        [candidate(), candidate({ matchTime: "2026-09-09T19:20:00Z" })],
        dict
      ).status
    ).toBe("ambiguous")
  })
  it("rejects contradictory team IDs even when the names agree", () => {
    expect(
      matchLfaWithRecovery(
        game,
        [candidate({ homeTeamId: "wrong" })],
        dict,
        teamIdIndex([["첼시", "right"]])
      ).candidate
    ).toBeNull()
  })
  it("retains the existing one-team rule inside the exact kickoff slot", () => {
    expect(
      matchLfaWithRecovery(
        game,
        [candidate({ awayTeam: "Unknown", matchTime: game.matchTime })],
        dict
      ).status
    ).toBe("matched")
  })
})
