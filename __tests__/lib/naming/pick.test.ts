import { describe, it, expect } from "vitest"
import { pickWinner } from "@/lib/naming/pick"

describe("pickWinner — 네이버 검색량 기반 표기 판정", () => {
  it("압도적 다수 표기 채택 (기마랑이스 케이스)", () => {
    const v = pickWinner([
      { candidate: "브루노 기마랑이스", total: 1200 },
      { candidate: "브루노 기마라에스", total: 80 },
    ])
    expect(v.winner).toBe("브루노 기마랑이스")
  })

  it("검색량 부족이면 보류 — 무명 선수를 지어내 등재하지 않는다", () => {
    const v = pickWinner([
      { candidate: "아유브 부아디", total: 12 },
      { candidate: "아유브 부아디디", total: 3 },
    ])
    expect(v.winner).toBeNull()
    expect(v.reason).toContain("검색량 부족")
  })

  it("표기 경합(3배 미만)이면 보류 — 언론이 갈리면 사람이 정한다", () => {
    const v = pickWinner([
      { candidate: "이삭", total: 500 },
      { candidate: "이사크", total: 400 },
    ])
    expect(v.winner).toBeNull()
    expect(v.reason).toContain("경합")
  })

  it("2위가 0건이면 1위 채택 (경합 아님)", () => {
    const v = pickWinner([
      { candidate: "정답 표기", total: 100 },
      { candidate: "환각 표기", total: 0 },
    ])
    expect(v.winner).toBe("정답 표기")
  })

  it("후보가 비면 보류", () => {
    expect(pickWinner([]).winner).toBeNull()
  })
})
