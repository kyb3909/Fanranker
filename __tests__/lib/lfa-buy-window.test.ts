import { describe, it, expect } from "vitest"
import { withinBuyWindow } from "@/lib/lfa/day-freshness"

/**
 * 유료 조회 날짜 울타리 (2026-08-25 크레딧 화재).
 *
 * `/matches?date=` 가 형식만 맞으면 아무 날짜나 받았고, 그 페이지의 날짜 칩이 양쪽으로
 * 끝없이 이어져 크롤러에게 무한 링크 공간이었다. 한 페이지가 곧 유료 API 하루치 구매라
 * **2003~2047년 9,466일**이 캐시에 쌓였고 2시간에 1,742건이 나갔다 (하루 ~21,000크레딧,
 * 평소 647의 32배). 창 밖 날짜는 절대 사지 않는다.
 */

const NOW = Date.parse("2026-08-25T04:00:00Z")
const day = (offset: number) =>
  new Date(Math.floor(NOW / 86_400_000) * 86_400_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)

describe("withinBuyWindow", () => {
  it("오늘은 산다", () => {
    expect(withinBuyWindow(day(0), NOW)).toBe(true)
  })

  it("창 안쪽 경계(과거 90일 · 미래 30일)는 산다", () => {
    expect(withinBuyWindow(day(-90), NOW)).toBe(true)
    expect(withinBuyWindow(day(30), NOW)).toBe(true)
  })

  it("창 밖 하루만 넘어도 안 산다", () => {
    expect(withinBuyWindow(day(-91), NOW)).toBe(false)
    expect(withinBuyWindow(day(31), NOW)).toBe(false)
  })

  it("⭐실제로 캐시에 쌓였던 크롤 날짜들을 전부 막는다", () => {
    for (const d of [
      "2003-08-11",
      "2015-04-05",
      "2017-06-14",
      "2028-04-05",
      "2038-05-03",
      "2047-03-08",
    ]) {
      expect(withinBuyWindow(d, NOW), d).toBe(false)
    }
  })

  it("형식이 깨진 값은 안 산다", () => {
    for (const d of ["", "2026-8-5", "abcd-ef-gh", "2026-13-45", "2026-08-25T00:00:00Z"]) {
      expect(withinBuyWindow(d, NOW), d).toBe(false)
    }
  })
})
