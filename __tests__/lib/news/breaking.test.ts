import { describe, it, expect } from "vitest"
import { isBreakingNewsItem, isRetryableGateReasons } from "@/lib/news/breaking"
import { UNKNOWN_PLAYER_PREFIX } from "@/lib/news/alias-suggest"

/**
 * 브레이킹 판별 — 비니시우스 실사고(2026-08-07)의 재발 방지선.
 * "가장 큰 뉴스"가 루머 단신과 같은 잠금·침묵을 타지 않게 하는 P0 의 판별 기준.
 */
describe("isBreakingNewsItem", () => {
  it("실사고 재현: 클럽명 브래킷([Real Madrid]) = 구단 공식 발표 재작성 → 브레이킹", () => {
    expect(
      isBreakingNewsItem({
        draftTitle: "[Real Madrid] 비니시우스 주니어, 2032년까지 계약 연장 발표",
        originalTitle: null,
        sourceUrl: null,
      })
    ).toBe(true)
    expect(
      isBreakingNewsItem({
        draftTitle: "[레알 마드리드] 비니시우스 주니오르, 2032년까지 계약 연장",
        originalTitle: null,
        sourceUrl: null,
      })
    ).toBe(true)
  })

  it("영문 원제의 오피셜 마커(officially announced)도 브레이킹", () => {
    expect(
      isBreakingNewsItem({
        draftTitle: "레알 마드리드, 얀 디오망데 영입",
        originalTitle: "Real Madrid have officially announced the signing of Yan Diomande",
        sourceUrl: null,
      })
    ).toBe(true)
  })

  it("기자 브래킷·루머는 브레이킹 아님", () => {
    expect(
      isBreakingNewsItem({
        draftTitle: "[Ornstein, Cortegana] 비니시우스 주니어, 새 계약 합의 임박",
        originalTitle: "Vinicius closing in on new deal",
        sourceUrl: null,
      })
    ).toBe(false)
    expect(
      isBreakingNewsItem({
        draftTitle: "[GeGlobe] 이적설 정리",
        originalTitle: "Transfer roundup",
        sourceUrl: null,
      })
    ).toBe(false)
  })
})

describe("isRetryableGateReasons", () => {
  it("사전 미등재만으로 막힌 반려 → 재시도 가능 (사전 등재로 해소되는 유형)", () => {
    expect(isRetryableGateReasons([`${UNKNOWN_PLAYER_PREFIX}비니시우스 주니어`])).toBe(true)
  })

  it("검사관 본문 반려·중복이 섞이면 재시도 불가 (재시도해도 같은 결과)", () => {
    expect(
      isRetryableGateReasons([`${UNKNOWN_PLAYER_PREFIX}아무개`, "문장이 심각하게 어색합니다."])
    ).toBe(false)
    expect(isRetryableGateReasons(["중복 기사 (동일 원문 URL 기발행)"])).toBe(false)
    expect(isRetryableGateReasons(["이미지 부적합: 배너"])).toBe(false)
  })

  it("빈 배열·비배열은 재시도 불가", () => {
    expect(isRetryableGateReasons([])).toBe(false)
    expect(isRetryableGateReasons(null)).toBe(false)
  })
})
