import { describe, expect, it } from "vitest"
import {
  isInterviewCandidate,
  normalizeForMatch,
  verifyQuote,
  MIN_MATERIAL_LENGTH,
} from "@/lib/interviews/scout"

const LONG = MIN_MATERIAL_LENGTH + 100

describe("isInterviewCandidate — 인터뷰 후보 판정 (채방관)", () => {
  it("발언자 콜론 + 따옴표 시작 (케르케즈 실사례 형태)", () => {
    expect(isInterviewCandidate("Kerkez: “I don’t like ‘pressure’ and that stuff.”", LONG)).toBe(
      true
    )
    expect(isInterviewCandidate('Arteta: "We have to win the league this year"', LONG)).toBe(true)
  })

  it("제목 속 40자 이상 인용", () => {
    expect(
      isInterviewCandidate(
        "Report says “I started to drive a truck when I was 10 years old in Serbia” in new piece",
        LONG
      )
    ).toBe(true)
  })

  it("interview / press conference 키워드", () => {
    expect(isInterviewCandidate("Full interview with Milos Kerkez", LONG)).toBe(true)
    expect(isInterviewCandidate("Arteta press conference ahead of the opener", LONG)).toBe(true)
  })

  it("일반 뉴스·이적설은 후보가 아니다", () => {
    expect(isInterviewCandidate("Chelsea agree £40m fee for defender", LONG)).toBe(false)
    expect(isInterviewCandidate("Matchday thread: Arsenal vs Liverpool", LONG)).toBe(false)
  })

  it("원문이 짧으면 인용 대조가 불가능 — 후보 탈락 (fail-closed)", () => {
    expect(isInterviewCandidate("Kerkez: “I don’t like pressure and that stuff.”", 50)).toBe(false)
  })
})

describe("verifyQuote — 발췌 대조 (환각 구조적 0 의 지점)", () => {
  const material =
    "It has been quite the summer for Milos Kerkez. He said: “I don’t like ‘pressure’ and that stuff. I grew up a bit different in Serbia.” The defender added more."

  it("원문에 글자 그대로 있는 인용은 통과 — 따옴표 스타일 차이는 정규화로 흡수", () => {
    expect(
      verifyQuote(
        "I don't like 'pressure' and that stuff. I grew up a bit different in Serbia.",
        material,
        ""
      )
    ).toBe(true)
  })

  it("LLM 이 지어내거나 의역한 문장은 죽는다", () => {
    expect(verifyQuote("Kerkez expressed his dislike of external expectations", material, "")).toBe(
      false
    )
    expect(verifyQuote("I really hate pressure and all that stuff completely", material, "")).toBe(
      false
    )
  })

  it("제목에만 있는 인용도 통과 (레딧 제목이 인용 전문인 관행)", () => {
    const title = "Kerkez: “I started to drive a truck when I was 10 years old.”"
    expect(
      verifyQuote("I started to drive a truck when I was 10 years old.", "x".repeat(400), title)
    ).toBe(true)
  })

  it("15자 미만 조각은 우연 일치 위험 — 거부", () => {
    expect(verifyQuote("I grew up", material, "")).toBe(false)
  })
})

describe("normalizeForMatch", () => {
  it("곱슬 따옴표·아포스트로피·공백을 접는다", () => {
    expect(normalizeForMatch("“I  don’t   like…”")).toBe('"I don\'t like..."')
  })
})
