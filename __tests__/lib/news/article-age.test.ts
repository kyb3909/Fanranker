import { describe, expect, it } from "vitest"
import { articleAgeHours, dateFromUrlPath, MAX_ARTICLE_AGE_HOURS } from "@/lib/news/article-age"

const NOW = Date.parse("2026-09-03T00:00:00Z")
const H = 3_600_000

describe("기사 나이 — 재탕 차단의 근거", () => {
  it("슈퍼컵 recap 사고: publishedAt 이 8/13 이면 72시간을 훌쩍 넘긴다", () => {
    const age = articleAgeHours({ publishedAt: "2026-08-13T12:09:40.000Z", now: NOW })
    expect(age).not.toBeNull()
    expect(age!).toBeGreaterThan(MAX_ARTICLE_AGE_HOURS)
  })

  it("publishedAt 이 없으면 원문 URL 의 /YYYY/MM/DD/ 로 추정한다", () => {
    const age = articleAgeHours({
      sourceUrl:
        "https://www.nytimes.com/athletic/7444254/2026/08/28/ibrahim-mbaye-aston-villa-psg-transfer/",
      now: NOW,
    })
    expect(age).toBeCloseTo((NOW - Date.parse("2026-08-28T12:00:00Z")) / H, 3)
  })

  it("월까지만 있는 경로(/2026/08/)는 애매해서 판정하지 않는다", () => {
    expect(
      dateFromUrlPath("https://algerie.football/2026/08/super-coupe-deurope-2026-psg-aston-villa/")
    ).toBeNull()
    expect(
      articleAgeHours({ sourceUrl: "https://algerie.football/2026/08/x/", now: NOW })
    ).toBeNull()
  })

  it("게시 시각을 어디서도 모르면 null — 통과시킨다", () => {
    expect(
      articleAgeHours({
        sourceUrl: "https://www.bbc.com/sport/football/articles/cgl7yw9y1weo",
        now: NOW,
      })
    ).toBeNull()
    expect(articleAgeHours({ now: NOW })).toBeNull()
  })

  it("publishedAt 이 깨진 값이면 URL 로 넘어가고, 미래 시각은 버린다", () => {
    expect(
      articleAgeHours({
        publishedAt: "not-a-date",
        sourceUrl: "https://x.com/2026/09/02/a/",
        now: NOW,
      })
    ).toBeCloseTo((NOW - Date.parse("2026-09-02T12:00:00Z")) / H, 3)
    expect(articleAgeHours({ publishedAt: "2027-01-01T00:00:00Z", now: NOW })).toBeNull()
  })

  it("방금 나온 기사는 0 에 가깝다", () => {
    expect(
      articleAgeHours({ publishedAt: new Date(NOW - 30 * 60_000).toISOString(), now: NOW })
    ).toBeCloseTo(0.5, 3)
  })
})
