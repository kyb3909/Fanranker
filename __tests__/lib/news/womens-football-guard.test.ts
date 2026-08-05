import { describe, expect, it } from "vitest"
import { isWomensFootball } from "@/lib/news/quality-gate"

/**
 * 여자 축구 가드 — 운영자 확정 정책(전면 제외)이라 **놓치면 안 되는 쪽**이 훨씬 중요하다.
 * 동시에 한국어에는 낱말 경계가 없어 음차된 사람 이름을 무는 사고가 실제로 났다.
 * 두 방향을 같이 잠근다.
 */

describe("여자 축구 가드 — 반드시 잡아야 하는 것", () => {
  it.each([
    ["한국어 표기", "바르셀로나 여자팀, 맨체스터 시티와 친선전"],
    ["팀명 뒤 위민", "아스날 위민, WSL 개막전 승리"],
    ["여자 축구", "여자 축구 국가대표팀 소집 명단 발표"],
    ["여자 대표팀", "잉글랜드 여자 대표팀 감독 선임"],
    ["여축 약어", "여축 리그 일정 공개"],
    ["영문 women's", "Arsenal Women's team announce signing"],
    ["대회 약어 WSL", "Chelsea top the WSL table"],
    ["대회 약어 NWSL", "Portland Thorns clinch NWSL playoff spot"],
    ["대회 약어 UWCL", "Barcelona reach the UWCL final"],
    ["독일어", "FC Bayern Frauen gewinnen"],
    ["스페인어", "El fútbol femenino crece"],
    ["프랑스어", "L'équipe féminine de Lyon"],
  ])("%s", (_label, text) => {
    expect(isWomensFootball(text)).toBe(true)
  })

  it("제목이 깨끗해도 출처 URL 로 잡는다 (몰리 바트립 실사고)", () => {
    expect(
      isWomensFootball("바트립, 새 시즌 준비 완료", "https://www.arsenal.com/womens/news/x")
    ).toBe(true)
  })

  it("한국어 번역 제목에서 성별이 지워져도 영문 원제로 잡는다", () => {
    expect(isWomensFootball("바트립 인터뷰", null, "Arsenal Women star Molly Bartrip speaks")).toBe(
      true
    )
  })
})

describe("여자 축구 가드 — 잡으면 안 되는 것", () => {
  // 2026-08-05 실사고: 아스날 유망주 Max Dowman("맥스 도우먼")이 든 BBC 남자
  // 프리미어리그 기사가 '우먼' 하나로 통째로 반려됐다.
  it("음차된 남자 선수 이름을 물지 않는다 (도우먼 = Max Dowman)", () => {
    expect(
      isWomensFootball(
        "[BBC] 프리미어리그 2026-27 주목 유망주 20인 소개, 루카 윌리엄스-바넷 포함",
        "아스날의 맥스 도우먼은 16세 73일에 리그 최연소 득점 기록을 세웠으며, 이번 시즌 더 많은 출전 기회를 기대하고 있습니다.",
        "https://www.bbc.co.uk/sport/football/articles/cre4np3pnxqo"
      )
    ).toBe(false)
  })

  it.each([
    ["보우먼", "보우먼이 후반 교체 투입됐다"],
    ["카우먼", "카우먼 감독의 전술 변화"],
  ])("앞 글자가 한글이면 우먼/위민을 무시한다 — %s", (_label, text) => {
    expect(isWomensFootball(text)).toBe(false)
  })

  it("평범한 남자 축구 기사는 통과한다", () => {
    expect(
      isWomensFootball(
        "아스날, 리버풀 2-0 격파",
        "사카가 선제골을 넣었고 마르티넬리가 쐐기골을 추가했다.",
        "https://www.bbc.co.uk/sport/football/articles/abc"
      )
    ).toBe(false)
  })
})
