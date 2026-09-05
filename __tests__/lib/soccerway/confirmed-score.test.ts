import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { confirmScore } from "@/lib/soccerway/confirmed-score"

const lfa = (home: number | null, away: number | null, finished = true) => ({
  home,
  away,
  finished,
})

describe("리포트 점수는 베트맨 결과와 무관하게 LFA 종료 결과를 사용한다", () => {
  it("LFA 종료 점수만으로 확정한다", () => {
    expect(confirmScore(lfa(2, 3))).toEqual({ ok: true, score: "2-3" })
    expect(confirmScore).toHaveLength(1)
  })
  it.each([null, { home: null, away: null }, { home: 3, away: 0 }, { home: 3, away: 2 }])(
    "베트맨 값이 없거나 다르거나 뒤집혀도 영향을 주지 않는다: %j",
    (betman) => {
      expect(Reflect.apply(confirmScore, undefined, [lfa(2, 3), betman])).toEqual({
        ok: true,
        score: "2-3",
      })
    }
  )
  it("LFA 경기나 점수가 없으면 아직 확정하지 않는다", () => {
    expect(confirmScore(null).ok).toBe(false)
    expect(confirmScore(lfa(null, 1)).ok).toBe(false)
    expect(confirmScore(lfa(1, null)).ok).toBe(false)
  })
  it("진행 중의 점수를 최종 점수로 쓰지 않는다", () => {
    expect(confirmScore(lfa(1, 0, false))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("종료 전"),
    })
  })
  it("0-0도 정상 종료 점수다", () => {
    expect(confirmScore(lfa(0, 0))).toEqual({ ok: true, score: "0-0" })
  })
  it("실제 리포트 호출부도 베트맨 점수를 넘기지 않는다", () => {
    const code = readFileSync("lib/soccerway/match-extras.ts", "utf8")
    expect(code).toContain("const verdict = confirmScore(lfa)")
    expect(code).not.toContain("confirmScore(lfa,")
  })
})
