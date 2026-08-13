import { describe, expect, it } from "vitest"
import {
  formatFixtureLine,
  parseDateHint,
  selectFixture,
  type FixtureRow,
} from "@/lib/tarot/fixture"

// 2026-08-13 21:00 KST (= 12:00 UTC)
const NOW = new Date("2026-08-13T12:00:00Z")

function row(partial: Partial<FixtureRow>): FixtureRow {
  return {
    home_team_name: "홈팀",
    away_team_name: "원정팀",
    match_time: "2026-08-15T10:00:00+00:00",
    sport: "축구",
    league_code: "EPL",
    venue: null,
    ...partial,
  }
}

describe("parseDateHint", () => {
  it("M월 D일 → KST 날짜", () => {
    expect(parseDateHint("9월 17일 경기 이길까요?", NOW)).toBe("2026-09-17")
    expect(parseDateHint("9월17일은?", NOW)).toBe("2026-09-17")
  })

  it("이미 지난 월일은 내년으로 넘긴다", () => {
    expect(parseDateHint("1월 5일 경기", NOW)).toBe("2027-01-05")
  })

  it("오늘/내일/모레는 KST 기준 상대 날짜", () => {
    expect(parseDateHint("오늘 이길까?", NOW)).toBe("2026-08-13")
    expect(parseDateHint("내일 경기 어때?", NOW)).toBe("2026-08-14")
    expect(parseDateHint("모레 경기", NOW)).toBe("2026-08-15")
  })

  it("날짜 표현이 없으면 null", () => {
    expect(parseDateHint("맨유 이길 수 있을까요?", NOW)).toBeNull()
  })
})

describe("selectFixture", () => {
  it("별칭(맨유)이 betman 축약 표기(맨체스U)에 걸린다", () => {
    const rows = [row({ home_team_name: "맨체스U", away_team_name: "아스널" })]
    const f = selectFixture("맨유 이길 수 있을까요?", rows, NOW)
    expect(f?.home).toBe("맨체스U")
  })

  it("아스날(관용 표기) → 아스널", () => {
    const rows = [row({ home_team_name: "리버풀", away_team_name: "아스널" })]
    expect(selectFixture("아스날 우승 각인가요?", rows, NOW)?.away).toBe("아스널")
  })

  it("전체 팀명 부분일치 — 별칭 사전에 없는 팀도 잡힌다", () => {
    const rows = [row({ home_team_name: "도쿄 베르디", away_team_name: "가시와 레이솔" })]
    expect(selectFixture("도쿄 베르디 이번엔 이길까?", rows, NOW)?.home).toBe("도쿄 베르디")
  })

  it("두 팀 다 언급된 경기가 한 팀만 걸린 경기보다 우선", () => {
    const rows = [
      row({
        home_team_name: "맨체스U",
        away_team_name: "번리",
        match_time: "2026-08-14T14:00:00+00:00",
      }),
      row({
        home_team_name: "맨체스U",
        away_team_name: "아스널",
        match_time: "2026-08-16T14:00:00+00:00",
      }),
    ]
    const f = selectFixture("맨유 대 아스널, 누가 이길까요?", rows, NOW)
    expect(f?.away).toBe("아스널")
  })

  it("전체명 일치가 별칭보다 세다 — '레알 소시에다드' 질문이 레알 마드리드로 새지 않는다", () => {
    const rows = [
      row({
        home_team_name: "레알마드리드",
        away_team_name: "헤타페",
        match_time: "2026-08-14T14:00:00+00:00",
      }),
      row({
        home_team_name: "레알소시에다드",
        away_team_name: "세비야",
        match_time: "2026-08-16T14:00:00+00:00",
      }),
    ]
    const f = selectFixture("레알소시에다드 경기 어떨까?", rows, NOW)
    expect(f?.home).toBe("레알소시에다드")
  })

  it("마켓별 중복 row 는 한 경기로 접힌다", () => {
    const dup = row({ home_team_name: "리버풀", away_team_name: "본머스" })
    expect(selectFixture("리버풀 이길까?", [dup, { ...dup }, { ...dup }], NOW)?.home).toBe("리버풀")
  })

  it("날짜를 콕 집었는데 그 날짜에 경기가 없으면 null (틀린 무대 금지)", () => {
    const rows = [row({ home_team_name: "맨체스U", match_time: "2026-08-16T14:00:00+00:00" })]
    expect(selectFixture("9월 17일 맨유 경기 이길까요?", rows, NOW)).toBeNull()
  })

  it("날짜 힌트가 맞으면 그 날짜 경기를 고른다 (KST 변환 포함)", () => {
    const rows = [
      // 8/16 23:30 UTC = KST 8/17 08:30
      row({ home_team_name: "맨체스U", match_time: "2026-08-16T23:30:00+00:00" }),
    ]
    expect(selectFixture("8월 17일 맨유 경기?", rows, NOW)?.home).toBe("맨체스U")
  })

  it("팀 언급이 없으면 null", () => {
    const rows = [row({ home_team_name: "맨체스U", away_team_name: "아스널" })]
    expect(selectFixture("오늘 우리 팀 이길 수 있을까요?", rows, NOW)).toBeNull()
  })

  it("NBA 별칭 — 레이커스/골스가 betman 축약 표기에 걸린다", () => {
    const rows = [
      row({ home_team_name: "LA레이커", away_team_name: "골든워리", league_code: "NBA" }),
    ]
    expect(selectFixture("레이커스 이길까?", rows, NOW)?.home).toBe("LA레이커")
    expect(selectFixture("골스 요즘 어때?", rows, NOW)?.away).toBe("골든워리")
  })

  it("NBA 전체 팀명 일치 — 뉴욕 닉스 (별칭 사전 미등록 팀)", () => {
    const rows = [
      row({ home_team_name: "뉴욕 닉스", away_team_name: "브루네츠", league_code: "NBA" }),
    ]
    expect(selectFixture("뉴욕 닉스 경기 어떨까?", rows, NOW)?.home).toBe("뉴욕 닉스")
  })
})

describe("formatFixtureLine", () => {
  it("KST 일시 + 대회 + 홈/원정 + 구장, 전력 정보 없음", () => {
    const f = selectFixture(
      "맨유 이길까?",
      [
        row({
          home_team_name: "맨체스U",
          away_team_name: "아스널",
          match_time: "2026-08-16T23:30:00+00:00",
          venue: "올드트래퍼드",
        }),
      ],
      NOW
    )!
    const line = formatFixtureLine(f)
    expect(line).toContain("8월 17일")
    expect(line).toContain("프리미어리그")
    expect(line).toContain("맨체스U(홈) vs 아스널(원정)")
    expect(line).toContain("올드트래퍼드")
  })

  it("식별자성 리그 코드(c8 등)는 숨긴다", () => {
    const f = selectFixture("리버풀?", [row({ home_team_name: "리버풀", league_code: "c8" })], NOW)!
    expect(formatFixtureLine(f)).not.toContain("c8")
  })
})
