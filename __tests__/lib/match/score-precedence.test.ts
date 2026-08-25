import { describe, it, expect } from "vitest"
import { isLiveState, pickScore } from "@/lib/match/score-precedence"

/**
 * 2026-08-25 외부 감사 P0-2 실사고:
 *   같은 시각 `/matches` 는 "경기 중 2-1", 매치센터는 "FT 2-2".
 *   같은 사이트가 한 경기를 두 가지로 말했다.
 *
 * ⚠️ 감사는 이걸 **캐시 문제**로 봤지만 아니었다. 두 지면이 서로 다른 우선순위를
 *    들고 있었고, 와이즈토토가 라이브 점수를 안 주는 탓에 낡은 값이 이겼다.
 */
describe("pickScore", () => {
  it("⭐라이브면 산 피드만 믿는다 — 실사고 재현", () => {
    // 와이즈토토 2-1(낡음) vs 산 피드 2-2(실시간) → 산 피드가 이겨야 한다
    expect(pickScore(true, 2, 2)).toBe(2)
    expect(pickScore(true, 2, 1)).toBe(2)
  })

  it("⚠️라이브인데 산 피드가 아직 없으면 비워 둔다", () => {
    // 낡은 값을 실시간인 척 보여주는 것이 이 사고의 본질이었다
    expect(pickScore(true, null, 1)).toBeNull()
    expect(pickScore(true, undefined, 3)).toBeNull()
  })

  it("끝난 경기는 와이즈토토가 먼저 (정산 값)", () => {
    expect(pickScore(false, 2, 3)).toBe(3)
  })

  it("와이즈토토가 없으면 산 피드로 채운다", () => {
    expect(pickScore(false, 2, null)).toBe(2)
  })

  it("둘 다 없으면 null", () => {
    expect(pickScore(false, null, null)).toBeNull()
    expect(pickScore(true, null, null)).toBeNull()
  })

  it("0 을 '없음'으로 다루지 않는다 — 0-0 은 정상 스코어다", () => {
    expect(pickScore(false, 1, 0)).toBe(0)
    expect(pickScore(true, 0, 2)).toBe(0)
  })
})

describe("isLiveState", () => {
  it("진행 중만 라이브다", () => {
    expect(isLiveState("in_progress")).toBe(true)
    for (const s of ["completed", "scheduled", "cancelled", null, undefined]) {
      expect(isLiveState(s)).toBe(false)
    }
  })
})
