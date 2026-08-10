import { describe, expect, it } from "vitest"
import {
  LEAD_CHARS,
  renderInterestInput,
  toInterestItem,
  type InterestItem,
} from "@/lib/news/interest-filter"

/**
 * 관심도 필터 입력 조립 — LLM 판정 자체가 아니라 **판정에 무엇이 들어가는가**를 지킨다.
 *
 * 도입 당일(2026-08-10) 드라이런에서 크론을 죽일 뻔한 버그가 났다: `draft.content` 를
 * 문자열로 가정하고 `.replace()` 를 불렀는데 실제로는 **TipTap JSON 객체**였다
 * (news_reservoir.draft.content, posts.content 둘 다 object). 매시간 TypeError 로
 * 죽으면서 "판정 실패 = 유지"에 걸려 필터가 조용히 무력화됐을 것이다 — 정확히
 * 이 필터가 고치려던 그 상태로.
 */
describe("toInterestItem — 본문 추출", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "아스널이" }] },
      { type: "paragraph", content: [{ type: "text", text: "기마랑이스를 영입했다" }] },
    ],
  }

  it("TipTap JSON 객체에서 본문을 뽑는다 (문자열로 가정하면 크론이 죽는다)", () => {
    const item = toInterestItem({ title: "제목", content: doc }, false)
    expect(item.lead).toBe("아스널이 기마랑이스를 영입했다")
  })

  it("문자열 본문도 그대로 받는다", () => {
    expect(toInterestItem({ title: "t", content: "그냥 문자열" }, false).lead).toBe("그냥 문자열")
  })

  it("본문이 없거나 draft 가 null 이어도 던지지 않는다", () => {
    expect(toInterestItem({ title: "t" }, false).lead).toBe("")
    expect(toInterestItem(null, false)).toEqual({ title: "", lead: "", bigClub: false })
  })

  it("공백을 접고 LEAD_CHARS 로 자른다", () => {
    const long = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "가".repeat(500) }] }],
    }
    const item = toInterestItem({ title: "t", content: long }, false)
    expect(item.lead).toHaveLength(LEAD_CHARS)
  })

  it("bigClub 표시를 그대로 전달한다", () => {
    expect(toInterestItem({ title: "t", content: doc }, true).bigClub).toBe(true)
  })
})

describe("renderInterestInput — 프롬프트 입력", () => {
  const items: InterestItem[] = [
    { title: "아스널, 기마랑이스 영입", lead: "7,500만 파운드", bigClub: true },
    { title: "무명팀 소식", lead: "", bigClub: false },
  ]

  it("빅클럽만 [빅클럽] 표시가 붙는다 — 축① 통과 신호", () => {
    const out = renderInterestInput(items)
    expect(out).toContain("1. [빅클럽] 아스널, 기마랑이스 영입")
    expect(out).toContain("2. 무명팀 소식")
    expect(out).not.toContain("2. [빅클럽]")
  })

  it("번호가 1부터 매겨진다 — 판정 결과를 이 번호로 되찾는다", () => {
    expect(renderInterestInput(items).startsWith("1. ")).toBe(true)
  })

  it("본문이 있을 때만 본문 줄을 붙인다", () => {
    const out = renderInterestInput(items)
    expect(out).toContain("본문: 7,500만 파운드")
    expect(out.split("\n").filter((l) => l.includes("본문:"))).toHaveLength(1)
  })
})
