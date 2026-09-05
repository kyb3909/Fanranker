import { expect, it } from "vitest"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"
import { lfaLeagueId } from "@/lib/lfa/leagues"

it("모든 매치 페이지 리그가 LFA ID를 가진다", () => {
  expect([...MATCH_PAGE_LEAGUES].filter((code) => !lfaLeagueId(code))).toEqual([])
  expect(lfaLeagueId("스페FA컵")).toBe("apdwh753fupxheygs8seahh7x")
})
