import { describe, expect, it } from "vitest"
import { matchTitleScore } from "@/lib/match/score-precedence"

const lfaFt = { finished: true, live: false, homeScore: 0, awayScore: 3 }

describe("매치 페이지 제목 스코어 — betman 발표 전엔 LFA 확정 스코어", () => {
  it("betman 이 아직 없고 LFA 가 FT 면 LFA 스코어를 제목에 쓴다 (2026-09-03 밀월 0:3 렉섬)", () => {
    expect(
      matchTitleScore({ betmanStatus: "scheduled", betmanHome: null, betmanAway: null, lfa: lfaFt })
    ).toBe(" 0:3 ")
  })

  it("betman 이 발표되면 betman 스코어가 이긴다 (본문 pickScore 와 같은 우선순위)", () => {
    expect(
      matchTitleScore({
        betmanStatus: "completed",
        betmanHome: 0,
        betmanAway: 3,
        lfa: { ...lfaFt, homeScore: 1, awayScore: 3 },
      })
    ).toBe(" 0:3 ")
  })

  it("라이브면 LFA 산 스코어만 — betman 은 라이브 점수를 주지 않는다", () => {
    expect(
      matchTitleScore({
        betmanStatus: "in_progress",
        betmanHome: null,
        betmanAway: null,
        lfa: { finished: false, live: true, homeScore: 1, awayScore: 0 },
      })
    ).toBe(" 1:0 ")
  })

  it("킥오프 전(스코어 없음)이나 캐시 없음이면 ' vs '", () => {
    expect(
      matchTitleScore({ betmanStatus: "scheduled", betmanHome: null, betmanAway: null, lfa: null })
    ).toBe(" vs ")
    expect(
      matchTitleScore({
        betmanStatus: "scheduled",
        betmanHome: null,
        betmanAway: null,
        lfa: { finished: false, live: false, homeScore: null, awayScore: null },
      })
    ).toBe(" vs ")
  })
})
