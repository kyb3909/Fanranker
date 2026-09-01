import { describe, it, expect } from "vitest"
import { localizeFromRoster, localizeFromSquad, localizeTimelineName } from "@/lib/lfa/scorer-name"

/** 2026-09-01 애스턴 빌라 vs 아스널 실측 로스터 (일부) */
const ROSTER = [
  { label: "마틴 외데고르", roman: "odegaard martin" },
  { label: "부카요 사카", roman: "saka bukayo" },
  { label: "마르틴 수비멘디", roman: "zubimendi martin" },
  { label: "스즈키 자이온", roman: "suzuki zion" },
]

describe("localizeFromRoster", () => {
  it("⚠️ Ø 가 들어간 피드 약어를 그 경기 라인업으로 푼다 (종전엔 영문으로 남았다)", () => {
    expect(localizeFromRoster("M. Ødegaard", ROSTER)).toBe("마틴 외데고르")
  })

  it("같은 이름(Martin)이 둘 있어도 성으로 갈린다", () => {
    expect(localizeFromRoster("M. Zubimendi", ROSTER)).toBe("마르틴 수비멘디")
  })

  it("Højlund 처럼 ø 가 가운데 있어도 푼다", () => {
    const napoli = [{ label: "라스무스 호일룬", roman: "hojlund rasmus" }]
    expect(localizeFromRoster("R. Højlund", napoli)).toBe("라스무스 호일룬")
  })

  it("로스터에 없으면 원문 유지 — 틀린 한글보다 낫다", () => {
    expect(localizeFromRoster("L. Østigård", ROSTER)).toBe("L. Østigård")
  })

  it("후보가 여럿이면 안 바꾼다 (fail-closed)", () => {
    const twins = [
      { label: "파페 게예", roman: "gueye pape" },
      { label: "마게테 게예", roman: "gueye magnete" },
    ]
    expect(localizeFromRoster("Gueye", twins)).toBe("Gueye")
  })
})

describe("localizeFromSquad", () => {
  const squad = [
    { nameEn: "Gueye Pape", nameKr: "파페 게예" },
    { nameEn: "Gueye Magnete", nameKr: "마게테 게예" },
    { nameEn: "Hojlund Rasmus", nameKr: "라스무스 호일룬" },
  ]

  it("동명이인은 이니셜로 갈린다", () => {
    expect(localizeFromSquad("P. Gueye", squad)).toBe("파페 게예")
    expect(localizeFromSquad("M. Gueye", squad)).toBe("마게테 게예")
  })

  it("이니셜이 없어 갈리지 않으면 원문 유지", () => {
    expect(localizeFromSquad("Gueye", squad)).toBe("Gueye")
  })

  it("사전이 비면 아무것도 하지 않는다", () => {
    expect(localizeFromSquad("R. Højlund", [])).toBe("R. Højlund")
  })
})

describe("localizeTimelineName — 라인업 → 스쿼드 순", () => {
  it("라인업으로 되면 스쿼드는 안 본다", () => {
    expect(localizeTimelineName("M. Ødegaard", ROSTER, [])).toBe("마틴 외데고르")
  })

  it("라인업에 없으면 스쿼드 폴백 (명단 밖 선수)", () => {
    const squad = [{ nameEn: "Ostigard Leo", nameKr: "레오 외스티고르" }]
    expect(localizeTimelineName("L. Østigård", ROSTER, squad)).toBe("레오 외스티고르")
  })

  it("빈 값은 null", () => {
    expect(localizeTimelineName(undefined, ROSTER, [])).toBeNull()
    expect(localizeTimelineName("  ", ROSTER, [])).toBeNull()
  })

  it("양쪽 다 실패하면 원문 그대로", () => {
    expect(localizeTimelineName("X. Unknown", ROSTER, [])).toBe("X. Unknown")
  })
})
