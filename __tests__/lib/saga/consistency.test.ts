import { describe, it, expect } from "vitest"
import { judgeClubConsistency } from "@/lib/saga/consistency"

/**
 * 시계열 클럽 일관성 (환각 방지 L3) — 디오망데 실사고의 재발 방지선.
 * 전날 "레알" 3건과 정면 모순인 "바르사" 오피셜을 기계가 잡는 층.
 */
describe("judgeClubConsistency", () => {
  it("실사고 재현: 최근 지배 클럽(레알 3회)과 전혀 겹치지 않는 오피셜 → 모순", () => {
    const v = judgeClubConsistency(
      ["Barcelona"],
      [["Real Madrid"], ["Real Madrid", "RB Leipzig"], ["Real Madrid"]]
    )
    expect(v.conflict).toBe(true)
    expect(v.dominant).toBe("real madrid")
  })

  it("최근 언급과 겹치면 정상 (레알 오피셜 + 레알 루머들)", () => {
    const v = judgeClubConsistency(
      ["Real Madrid"],
      [["Real Madrid"], ["Real Madrid", "RB Leipzig"]]
    )
    expect(v.conflict).toBe(false)
  })

  it("소속 클럽만 겹쳐도 같은 드라마 — 모순 아님", () => {
    // 오피셜이 [바르사, 라이프치히] 인데 최근 언급이 [레알, 라이프치히] — 라이프치히(소속) 겹침
    const v = judgeClubConsistency(
      ["Barcelona", "RB Leipzig"],
      [
        ["Real Madrid", "RB Leipzig"],
        ["Real Madrid", "RB Leipzig"],
      ]
    )
    expect(v.conflict).toBe(false)
  })

  it("최근 언급 1회뿐이면 지배로 치지 않는다 — 한 건으로 단정 금지", () => {
    const v = judgeClubConsistency(["Barcelona"], [["Real Madrid"]])
    expect(v.conflict).toBe(false)
  })

  it("최근 언급이 없으면 판단 보류 (첫 소식)", () => {
    const v = judgeClubConsistency(["Barcelona"], [])
    expect(v.conflict).toBe(false)
  })

  it("클럽 미상(빈 배열)이면 모순 판정 자체를 안 한다", () => {
    const v = judgeClubConsistency([], [["Real Madrid"], ["Real Madrid"]])
    expect(v.conflict).toBe(false)
  })

  it("같은 기사 안의 중복 클럽은 1표 (한 기사가 세 번 말해도 지배 아님)", () => {
    const v = judgeClubConsistency(["Barcelona"], [["Real Madrid", "Real Madrid", "Real Madrid"]])
    expect(v.conflict).toBe(false)
  })
})
