import { describe, it, expect } from "vitest"
import { stripUnevidencedAmounts, numericTokens } from "@/lib/news/amount-evidence"

/**
 * 금액 증거 검사 (2026-08-08 오너: "금액은 굳이 없으면 빼도 좋아").
 * 30일 실측의 수치 조작 2건(기마랑이스 £75m→"1억 유로", 디오망데 €140m→"1,400억")을
 * 재현해 잠근다 — 원문에 그 숫자가 그대로 없으면 금액 표현째 제거.
 */
describe("stripUnevidencedAmounts", () => {
  it("실사고 재현: £75m 원문이 '1억 유로'로 부풀려짐 → 금액 제거, 사실만 남김", () => {
    const r = stripUnevidencedAmounts(
      "아스널, 브루노 기마랑이스 1억 유로 영입",
      "Newcastle United sanction £75m sale of Bruno Guimaraes to Arsenal"
    )
    expect(r.title).toBe("아스널, 브루노 기마랑이스 영입")
    expect(r.removed).toHaveLength(1)
  })

  it("실사고 재현: €125m/135m/140m 원문의 '1,400억'(환율 왜곡) → 제거", () => {
    const r = stripUnevidencedAmounts(
      "레알, 디오망데 영입 1,400억",
      "Base transfer fee: €125m. Including add-ons: €135m. Total package: €140m."
    )
    expect(r.title).toBe("레알, 디오망데 영입")
    expect(r.removed).toHaveLength(1)
  })

  it("원문에 그대로 있는 금액은 유지", () => {
    const r = stripUnevidencedAmounts(
      "레알 마드리드, 디오망데 125m 유로에 영입",
      "Real Madrid sign Diomande for €125m from RB Leipzig"
    )
    expect(r.title).toBe("레알 마드리드, 디오망데 125m 유로에 영입")
    expect(r.removed).toHaveLength(0)
  })

  it("금액이 없는 제목은 그대로", () => {
    const r = stripUnevidencedAmounts(
      "[Real Madrid] 비니시우스 주니오르, 2032년까지 계약 연장",
      "Vinicius signs until 2033"
    )
    expect(r.title).toBe("[Real Madrid] 비니시우스 주니오르, 2032년까지 계약 연장")
    expect(r.removed).toHaveLength(0)
  })

  it("연봉 표기도 같은 규칙 — 원문에 2,000만이 20m 으로 있으면… 숫자 불일치라 제거 (정책상 허용)", () => {
    const r = stripUnevidencedAmounts(
      "비니시우스, 계약 연장…연봉 최대 2,000만 유로",
      "salary up to €20m per year"
    )
    // 2000 ∉ {20} — 정확한 환산이어도 원문 숫자가 아니면 제거 (오너: 금액 없이 사실만)
    expect(r.title).toBe("비니시우스, 계약 연장…연봉")
    expect(r.removed).toHaveLength(1)
  })

  it("부분 문자열 오폭 금지: 원문 140 이 있어도 1400 은 다른 숫자", () => {
    expect(numericTokens("€140m").has("140")).toBe(true)
    const r = stripUnevidencedAmounts("이적료 1,400억 규모", "fee worth €140m")
    expect(r.removed).toHaveLength(1)
  })
})
