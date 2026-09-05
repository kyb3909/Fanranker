import { describe, expect, it } from "vitest"
import { matchLfaCounterpart, type TeamSided } from "@/lib/match/pair-fixtures"

const dictionary = new Map([
  ["바이에른 뮌헨", "Bayern Munich"],
  ["맨체스터 시티", "Manchester City"],
  ["맨체스터 유나이티드", "Manchester United"],
  ["리버풀", "Liverpool"],
  ["첼시", "Chelsea"],
  ["아스널", "Arsenal"],
  ["본머스", "Bournemouth"],
])
const fixture = (homeTeam: string, awayTeam: string, extra: Partial<TeamSided> = {}) => ({
  homeTeam,
  awayTeam,
  leagueCode: "독일FA컵",
  matchTime: "2026-09-05T19:00:00Z",
  ...extra,
})

describe("대회·날짜·시각 + 한 팀 확정 매핑", () => {
  it("양쪽 모두 일정 정보가 없으면 이름이 같아도 연결하지 않는다", () => {
    const row = { homeTeam: "Chelsea", awayTeam: "Liverpool" }
    expect(matchLfaCounterpart(row, [row], dictionary).status).toBe("missing")
  })
  it("홈 인기팀이 맞으면 모르는 하부팀도 연결한다", () => {
    const candidate = fixture("Bayern Munich", "Unknown lower league club")
    expect(
      matchLfaCounterpart(fixture("바이에른 뮌헨", "낯선하부팀"), [candidate], dictionary)
    ).toEqual({ status: "matched", candidate, anchor: "home" })
  })
  it("원정 인기팀만 확실해도 연결한다", () => {
    const candidate = fixture("Unknown lower league club", "Bayern Munich")
    expect(
      matchLfaCounterpart(fixture("낯선하부팀", "바이에른 뮌헨"), [candidate], dictionary)
    ).toEqual({ status: "matched", candidate, anchor: "away" })
  })
  it("동시 킥오프 여러 경기 중 한 팀으로 하나만 남으면 연결한다", () => {
    const candidate = fixture("Bayern Munich", "Unknown")
    const others = [fixture("Chelsea", "Arsenal"), candidate, fixture("Liverpool", "Bournemouth")]
    expect(
      matchLfaCounterpart(fixture("바이에른 뮌헨", "미등록구단"), others, dictionary).candidate
    ).toBe(candidate)
  })
  it("확실한 한 팀이 같은 슬롯 두 후보에 있으면 보류한다", () => {
    const candidates = [
      fixture("Bayern Munich", "Unknown A"),
      fixture("Bayern Munich", "Unknown B"),
    ]
    expect(
      matchLfaCounterpart(fixture("바이에른 뮌헨", "미등록구단"), candidates, dictionary).status
    ).toBe("ambiguous")
    expect(
      matchLfaCounterpart(fixture("바이에른 뮌헨", "미등록구단"), candidates.reverse(), dictionary)
        .status
    ).toBe("ambiguous")
  })
  it.each([
    { leagueCode: "분데스리" },
    { matchTime: "2026-09-06T19:00:00Z" },
    { matchTime: "2026-09-05T20:00:00Z" },
    { matchTime: "2026-09-05T19:01:00Z" },
    { matchTime: "invalid" },
    { matchTime: undefined },
    { leagueCode: undefined },
  ])("슬롯이 다르거나 불완전하면 팀이 맞아도 거절: %j", (extra) => {
    expect(
      matchLfaCounterpart(
        fixture("바이에른 뮌헨", "미등록구단"),
        [fixture("Bayern Munich", "Unknown", extra)],
        dictionary
      ).status
    ).toBe("missing")
  })
  it("KST와 UTC가 다른 날짜 표기여도 같은 순간이면 같은 슬롯이다", () => {
    const candidate = fixture("Bayern Munich", "Unknown", {
      matchTime: "2026-09-06T04:00:00+09:00",
    })
    expect(
      matchLfaCounterpart(fixture("바이에른 뮌헨", "미등록구단"), [candidate], dictionary).candidate
    ).toBe(candidate)
  })
  it("상대 팀이 사전상 다른 팀으로 확인되면 확실한 홈 팀이 있어도 거절한다", () => {
    expect(
      matchLfaCounterpart(
        fixture("바이에른 뮌헨", "첼시"),
        [fixture("Bayern Munich", "Arsenal")],
        dictionary
      ).status
    ).toBe("conflict")
  })
  it("맨시티-리버풀을 맨유-리버풀에 붙이지 않는다", () => {
    expect(
      matchLfaCounterpart(
        fixture("맨체스터 시티", "리버풀"),
        [fixture("Manchester United", "Liverpool")],
        dictionary
      ).status
    ).toBe("conflict")
  })
  it("반대편 구단이 별칭 사전에 없어도 City/United 충돌은 인지한다", () => {
    const partial = new Map([
      ["맨체스터 시티", "Manchester City"],
      ["리버풀", "Liverpool"],
    ])
    expect(
      matchLfaCounterpart(
        fixture("맨체스터 시티", "리버풀"),
        [fixture("Man. United", "Liverpool")],
        partial
      ).status
    ).toBe("conflict")
  })
  it("같은 시각 맨시티/맨유가 모두 있어도 상대 팀과 함께 대조한다", () => {
    const wrong = fixture("Manchester United", "Liverpool")
    const right = fixture("Manchester City", "Bournemouth")
    expect(
      matchLfaCounterpart(fixture("맨체스터 시티", "본머스"), [wrong, right], dictionary).candidate
    ).toBe(right)
  })
  it("맨체스터라는 공통 토큰만으로는 한 팀 일치를 인정하지 않는다", () => {
    expect(
      matchLfaCounterpart(
        fixture("맨체스터 시티", "미등록구단"),
        [fixture("Manchester United", "Unknown")],
        dictionary
      ).candidate
    ).toBeNull()
  })
  it("City/United만 적힌 불완전 이름도 확정 근거가 아니다", () => {
    expect(
      matchLfaCounterpart(fixture("City", "미등록구단"), [fixture("City", "Unknown")], dictionary)
        .candidate
    ).toBeNull()
  })
  it("홈/원정이 뒤집힌 경기를 연결하면 점수가 뒤집히므로 보류한다", () => {
    expect(
      matchLfaCounterpart(
        fixture("바이에른 뮌헨", "낯선팀"),
        [fixture("Unknown", "Bayern Munich")],
        dictionary
      ).status
    ).toBe("conflict")
  })
  it("번역된 표시명보다 원본 구단 식별 증거를 우선한다", () => {
    const candidate = fixture("맨체스터 시티", "Liverpool", { homeTeamEn: "Manchester United" })
    expect(
      matchLfaCounterpart(fixture("맨체스터 시티", "리버풀"), [candidate], dictionary).status
    ).toBe("conflict")
  })
  it("정규화 후 두 구단이 공유하는 별칭은 확정 근거로 쓰지 않는다", () => {
    const aliases = new Map([
      ["공유이름", "Manchester City"],
      ["공유 이름", "Manchester United"],
    ])
    expect(
      matchLfaCounterpart(
        fixture("공유이름", "미등록구단"),
        [fixture("Manchester City", "Unknown")],
        aliases
      ).candidate
    ).toBeNull()
  })
})
