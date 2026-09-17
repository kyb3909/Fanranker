// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import {
  groundedLines,
  postPlainText,
  summarySourceName,
  summaryContentHash,
  quoteInText,
  quotesGrounded,
} from "@/lib/ticker/summarize-post"

/** 떡밥 세 줄 요약 (2026-09-18) — LLM 호출 밖의 순수 부분만 시험한다. */

const doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "음바페는 발롱도르 후보 30명에 포함됐다." }],
    },
    { type: "paragraph", content: [{ type: "text", text: "시상식은 9월 22일 파리에서 열린다." }] },
  ],
}

describe("groundedLines — 본문에 없는 숫자를 붙이면 요약 전체를 버린다", () => {
  const text = postPlainText(doc)
  it("본문에 있는 숫자만 쓴 줄은 통과", () => {
    expect(
      groundedLines(["후보 30명에 포함됐다.", "9월 22일 파리에서 열린다."], "제목", text)
    ).toBe(true)
  })
  it("본문에 없는 숫자가 끼면 실패", () => {
    expect(groundedLines(["후보 30명 중 5위다."], "제목", text)).toBe(false)
  })
  it("제목에 있는 숫자는 근거로 친다", () => {
    expect(groundedLines(["17일 면담한다."], "17일 면담 예정", text)).toBe(true)
  })
})

describe("summarySourceName — 글의 source_name 이 없으면 제목 프리픽스", () => {
  it("source_name 우선", () => {
    expect(summarySourceName("[BBC] 제목", "더 타임스")).toBe("더 타임스")
  })
  it("프리픽스 폴백", () => {
    expect(summarySourceName("[골닷컴] 제목", null)).toBe("골닷컴")
  })
  it("둘 다 없으면 null", () => {
    expect(summarySourceName("제목만", null)).toBeNull()
  })
})

describe("postPlainText / summaryContentHash", () => {
  it("TipTap 문서를 한 줄 텍스트로", () => {
    expect(postPlainText(doc)).toContain("음바페는 발롱도르 후보 30명에 포함됐다.")
    expect(postPlainText(null)).toBe("")
  })
  it("본문이 바뀌면 해시가 바뀐다 — 요약 재생성의 기준", () => {
    expect(summaryContentHash("a", "x")).not.toBe(summaryContentHash("a", "y"))
    expect(summaryContentHash("a", "x")).toBe(summaryContentHash("a", "x"))
  })
})

describe("quoteInText / quotesGrounded — 발언은 본문에 글자 그대로 있어야 한다", () => {
  const body =
    '에메리는 "계속 노력해야 한다. 훈련하고 노력해야 한다"고 말했다. 그는 "지금은 앞선 선수들이 있다"고 덧붙였다.'
  it("따옴표·공백·문장부호 차이는 무시하고 대조", () => {
    expect(quoteInText("계속 노력해야 한다, 훈련하고 노력해야 한다", body)).toBe(true)
    expect(quoteInText("계속 쉬어야 한다", body)).toBe(false)
  })
  it("단락 안의 큰따옴표 발언이 전부 본문에 있어야 통과", () => {
    expect(
      quotesGrounded(
        ["과제로는 “계속 노력해야 한다”고 했다.", "입지는 “지금은 앞선 선수들이 있다”고 답했다."],
        body
      )
    ).toBe(true)
    expect(quotesGrounded(["과제로는 “쉬어야 한다”고 했다."], body)).toBe(false)
    // 발언이 하나도 없으면 인터뷰 요약이 아니다
    expect(quotesGrounded(["에메리가 가르나초를 언급했다."], body)).toBe(false)
  })
})
