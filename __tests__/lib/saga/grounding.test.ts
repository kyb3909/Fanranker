import { describe, it, expect } from "vitest"
import { isGroundedInSource, recoverPlayerFromSource, buildAliasIndex } from "@/lib/saga/canonical"

/**
 * 2026-08-25 실사고 — 사가가 둘로 갈렸다.
 * 원문에 "Savinho" 가 또렷이 있는데 추출기가 "fabinho"(파비뉴, 다른 선수)를 냈고,
 * 그 문자열이 **그대로 기본키**가 됐다. 프롬프트로는 확률만 낮출 뿐 못 막는다.
 */
const TITLE = "Tottenham sign Savinho from Man City for £75m"

const index = buildAliasIndex([
  { romanized: "Savinho", preferred_ko: "사비뉴", surfaces: ["savinho", "사빈호"] },
  { romanized: "Fabinho", preferred_ko: "파비뉴", surfaces: ["fabinho"] },
  {
    romanized: "Bruno Guimaraes",
    preferred_ko: "브루누 기마랑이스",
    surfaces: ["bruno guimaraes"],
  },
])

describe("isGroundedInSource — 지어낸 이름을 가려낸다", () => {
  it("⭐원문에 없는 이름은 근거 없음 (실사고 형태)", () => {
    expect(isGroundedInSource("Fabinho", TITLE)).toBe(false)
  })

  it("원문에 있으면 근거 있음", () => {
    expect(isGroundedInSource("Savinho", TITLE)).toBe(true)
  })

  it("풀네임 중 한 토막만 있어도 근거로 본다 — 제목은 보통 성만 쓴다", () => {
    expect(isGroundedInSource("Savio Moreira de Oliveira", "Spurs close in on Savio")).toBe(true)
  })

  it("⚠️낱말 경계를 지킨다 — 'inho' 가 'Savinho' 에 걸리면 안 된다", () => {
    expect(isGroundedInSource("Inho", TITLE)).toBe(false)
  })

  it("악센트·대소문자를 무시한다", () => {
    expect(isGroundedInSource("Sesko", "Leipzig reject bid for Šeško")).toBe(true)
  })

  it("빈 이름은 근거 없음", () => {
    expect(isGroundedInSource("", TITLE)).toBe(false)
  })
})

describe("recoverPlayerFromSource — 원문에서 사전 선수를 되찾는다", () => {
  it("⭐지어낸 이름 대신 원문의 진짜 선수를 집는다", () => {
    const r = recoverPlayerFromSource(TITLE, index)
    expect(r?.key).toBe("savinho")
    expect(r?.ko).toBe("사비뉴")
  })

  it("⚠️후보가 여럿이면 포기한다 — 아무거나 고르면 오병합이다", () => {
    const two = "Savinho and Fabinho both linked with Spurs"
    expect(recoverPlayerFromSource(two, index)).toBeNull()
  })

  it("사전에 아무도 없으면 null", () => {
    expect(recoverPlayerFromSource("Some unknown youngster joins", index)).toBeNull()
  })
})
