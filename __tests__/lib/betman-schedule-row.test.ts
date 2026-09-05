import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { toScheduleRow } from "@/lib/betman/schedule-row"

describe("schedule-only upsert", () => {
  it.each(["scheduled", "in_progress", "completed", "cancelled"])(
    "%s 입력도 결과 컬럼을 payload에 포함하지 않는다",
    (status) => {
      const row = toScheduleRow("round-1", {
        game_no: "12",
        status,
        result: "home",
        home_score: 2,
        away_score: 0,
        home_win_odds: "1.8",
        match_time: "2026-09-04T19:00:00Z",
      })
      expect(row).toMatchObject({ round_id: "round-1", game_no: 12, home_win_odds: 1.8 })
      for (const key of ["status", "result", "home_score", "away_score"]) {
        expect(Object.hasOwn(row, key)).toBe(false)
      }
      // 결과가 일정 파싱 후 도착했더라도 일정 컬럼 병합은 결과를 덮지 않는다.
      expect({ status: "completed", home_score: 3, ...row }).toMatchObject({
        status: "completed",
        home_score: 3,
      })
    }
  )

  it.each([
    "scripts/vps/sync.sh",
    "scripts/vps-betman/sync.sh",
    "scripts/n8n-betman-parse-gameslip.js",
  ])("%s의 직접 저장 경로에도 scheduled를 재도입하지 않는다", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/status:\s*["']scheduled["']/)
  })
})
