import { describe, expect, it } from "vitest"
import { postsToTickerItems, tickerRootOf, TICKER_BOT_BY_ROOT } from "@/lib/ticker/from-posts"
import { stripSourcePrefix, isKoreanSource } from "@/lib/feed/source-rules"

/**
 * 티커 공급원 = 오늘의 떡밥 (2026-09-02). 라우트는 조회만, 판단은 여기.
 */

const row = (
  id: string,
  title: string,
  source_url: string | null = "https://theathletic.com/x"
) => ({
  id,
  title,
  source_url,
  created_at: "2026-09-02T10:00:00Z",
})

describe("postsToTickerItems", () => {
  it("봇 글 → 우리 글 페이지로 가는 티커 항목", () => {
    const items = postsToTickerItems([row("a1", "[로마노] 아스날, 미드필더 영입 임박")])
    expect(items).toEqual([
      { id: "post-a1", tag: "breaking", text: "아스날, 미드필더 영입 임박", href: "/post/a1" },
    ])
  })

  it("한국 매체 출처는 뺀다 — 떡밥과 같은 규칙", () => {
    const items = postsToTickerItems([
      row("k1", "국내 기사", "https://sports.naver.com/x"),
      row("k2", "국내 기사2", "https://www.chosun.com/x"),
      row("f1", "해외 기사", "https://bbc.com/x"),
    ])
    expect(items.map((i) => i.id)).toEqual(["post-f1"])
  })

  it("출처가 없는 글(source_url null)은 통과한다 — 국내 매체라는 증거가 없다", () => {
    expect(postsToTickerItems([row("n1", "제목", null)])).toHaveLength(1)
  })

  it("프리픽스만 있고 제목이 비면 뺀다", () => {
    expect(postsToTickerItems([row("e1", "[출처]   ")])).toEqual([])
  })

  it("limit 을 넘기지 않는다", () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`p${i}`, `제목 ${i}`))
    expect(postsToTickerItems(many, 20)).toHaveLength(20)
  })
})

describe("tickerRootOf — 팀 게시판은 종목 루트를 본다", () => {
  it("종목 자신", () => expect(tickerRootOf("football", null)).toBe("football"))
  it("팀 게시판 → 부모", () => expect(tickerRootOf("arsenal", "football")).toBe("football"))
  it("부모가 자기 자신이면 자기", () =>
    expect(tickerRootOf("football", "football")).toBe("football"))
  it("매핑 없는 종목은 봇이 없다 → 레거시로", () => {
    expect(TICKER_BOT_BY_ROOT[tickerRootOf("baseball", null)]).toBeUndefined()
  })
})

describe("source-rules", () => {
  it("[출처] 프리픽스 분리", () => {
    expect(stripSourcePrefix("[스카이 스포츠] 첼시 승리")).toEqual({
      source: "스카이 스포츠",
      title: "첼시 승리",
    })
    expect(stripSourcePrefix("프리픽스 없음")).toEqual({ source: null, title: "프리픽스 없음" })
  })
  it("isKoreanSource", () => {
    expect(isKoreanSource("https://m.sports.naver.com/a")).toBe(true)
    expect(isKoreanSource("https://www.skysports.com/a")).toBe(false)
    expect(isKoreanSource(null)).toBe(false)
  })
})
