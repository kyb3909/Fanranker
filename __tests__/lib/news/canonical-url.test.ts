import { describe, expect, it } from "vitest"
import { canonicalSourceUrl } from "@/lib/news/canonical-url"

/** "같은 원문 URL = 같은 기사" 규칙의 비교 기반 — 4개 관문이 전부 이 함수를 쓴다 */
describe("canonicalSourceUrl", () => {
  const base = "theguardian.com/football/2026/aug/04/arsenal-target-vinicius"

  it.each([
    ["www 유무", "https://www.theguardian.com/football/2026/aug/04/arsenal-target-vinicius"],
    [
      "utm 쿼리",
      "https://theguardian.com/football/2026/aug/04/arsenal-target-vinicius?utm_source=x&utm_medium=Social",
    ],
    [
      "프래그먼트",
      "https://theguardian.com/football/2026/aug/04/arsenal-target-vinicius#Echobox=123",
    ],
    ["꼬리 슬래시", "https://theguardian.com/football/2026/aug/04/arsenal-target-vinicius/"],
    ["대문자 호스트", "https://TheGuardian.com/football/2026/aug/04/arsenal-target-vinicius"],
    ["http 프로토콜", "http://theguardian.com/football/2026/aug/04/arsenal-target-vinicius"],
  ])("%s 차이는 같은 기사다", (_label, variant) => {
    expect(canonicalSourceUrl(variant)).toBe(base)
  })

  it("경로가 다르면 다른 기사다", () => {
    expect(canonicalSourceUrl("https://theguardian.com/football/a")).not.toBe(
      canonicalSourceUrl("https://theguardian.com/football/b")
    )
  })

  it("URL 이 아닌 값(내부 /post 경로 등)은 소문자 원문 그대로 — 비교 실패로 새지 않는다", () => {
    expect(canonicalSourceUrl("/post/abc-DEF")).toBe("/post/abc-def")
    expect(canonicalSourceUrl("  Not A Url ")).toBe("not a url")
  })
})
