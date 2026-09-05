import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("실황 갱신은 명단을 새로 구매하지 않고 저장분만 읽는다", () => {
  const code = readFileSync("lib/lfa/match.ts", "utf8")
  expect(code).not.toContain("getLfaLineup")
  expect(code).toContain("loadStoredLineup(game.gameId)")
})

it.each([
  "lib/match/get-lineup.ts",
  "lib/lfa/match.ts",
  "lib/motm/poll.ts",
  "app/match/[gameId]/match-extras-section.tsx",
])("%s keeps lineup/live data on LFA; article generation is a separate Soccerway path", (file) => {
  const code = readFileSync(file, "utf8")
  expect(code).not.toMatch(/from\s+["']@\/lib\/soccerway\/(?:lineup-lookup|match-extras)["']/)
})

it.each([
  "app/api/cron/match-reports/route.ts",
  "lib/saga/match-review.ts",
  "app/match/[gameId]/page.tsx",
])("%s preserves Soccerway article generation", (file) => {
  expect(readFileSync(file, "utf8")).toContain('from "@/lib/soccerway/match-extras"')
})
