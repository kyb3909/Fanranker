import { describe, expect, it } from "vitest"
import { isWomensFootball, isWomensFootballSource } from "@/lib/news/quality-gate"

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

/**
 * 2026-08-09 케롤린 실사고 — 한국어 번역에는 성별 단서가 남지 않는다.
 * 게이트가 검사하던 `draft.original.title` 은 스캐너가 안 보내는 필드라 **항상 null**
 * 이었고(몰리 바트립 사고 후 세운 방어가 한 번도 실행된 적 없음), 원문에 WSL 이 6회
 * 있었는데도 통과했다. 그래서 원문 리드를 본다 — 다만 밀도로 봐야 한다:
 * BBC·가디언 페이지는 사이드바에 women's football 링크가 섞여, 문자열 존재만으로
 * 막으면 실측 10건 중 8건이 남자 기사 오탐이었다.
 */
describe("isWomensFootballSource — 원문 리드 밀도", () => {
  it("리드에 WSL 이 있으면 차단 (케롤린 실사고 원문)", () => {
    const real =
      "City taken aback by forward's absence from training\n" +
      "WSL champions wait two days before mentioning deal\n" +
      "The Brazil forward Kerolin failed to report back for pre-season training at " +
      "Manchester City in July before her transfer to Barcelona had been agreed. " +
      "Manchester City eventually confirmed they had received a WSL record fee."
    expect(isWomensFootballSource(real)).toBe(true)
  })

  it("스페인어·카탈루냐어 여성형도 잡는다", () => {
    expect(
      isWomensFootballSource(
        "El FC Barcelona femenino tiene ante sí el reto. La jugadora llega hoy."
      )
    ).toBe(true)
  })

  it("⚠️ 사이드바에 women 1회 섞인 남자 기사는 통과 — 오탐이 진짜 알림을 죽인다", () => {
    const mensNews =
      "West Ham co-owner David Sullivan has been advised to stay away from home matches " +
      "while an investigation continues. The club said it would cooperate fully. " +
      "More from BBC Sport: Women's Super League fixtures announced."
    expect(isWomensFootballSource(mensNews)).toBe(false)
  })

  it("원문이 없으면 판정하지 않는다 (없는 근거로 막지 않는다)", () => {
    expect(isWomensFootballSource(null)).toBe(false)
    expect(isWomensFootballSource("")).toBe(false)
  })
})

describe("여자 월드컵·리그 표기 (패턴 누락 실사고)", () => {
  it("'여자 월드컵'을 잡는다 — 기존 패턴에 이 조합이 없어 U20 기사가 발행됐다", () => {
    expect(isWomensFootball("UEFA 보이콧 위협 속 프랑스, U20 여자 월드컵 출전 계획 유지")).toBe(
      true
    )
  })

  it("여자 리그·선수·국가대표 표기도 잡는다", () => {
    for (const t of ["여자 리그 개막", "여자 선수 영입", "여자 국가대표 명단"]) {
      expect(isWomensFootball(t)).toBe(true)
    }
  })

  it("맥스 도우먼은 여전히 통과한다 (한글 낱말 경계 오탐 방지 회귀)", () => {
    expect(isWomensFootball("아스날 맥스 도우먼, 프리미어리그 데뷔")).toBe(false)
  })
})

import { hasGamblingPromo } from "@/lib/news/quality-gate"

/**
 * 2026-08-25: 본문 품질 검사관(LLM)을 폐지하면서 그 판정 6번("도박/베팅 홍보")이
 * 같이 사라질 뻔했다. 아키텍처 가드가 잡아줬고, 낱말 검사로 대체했다.
 */
describe("hasGamblingPromo", () => {
  const doc = (t: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  })

  it("홍보 꼴을 잡는다", () => {
    expect(hasGamblingPromo("제목", doc("최고의 베팅 사이트 추천"))).toContain("도박")
    expect(hasGamblingPromo("먹튀 없는 곳", doc("본문"))).toContain("도박")
    expect(hasGamblingPromo("제목", doc("가입 머니 3만원 지급"))).toContain("도박")
  })

  it("⚠️축구 기사에 정상적으로 나오는 말은 막지 않는다", () => {
    expect(hasGamblingPromo("제목", doc("우승 배당률이 가장 낮았다"))).toBeNull()
    expect(hasGamblingPromo("제목", doc("스포츠토토 매출이 늘었다"))).toBeNull()
    expect(hasGamblingPromo("제목", doc("아스널이 2-1로 이겼다"))).toBeNull()
  })
})
