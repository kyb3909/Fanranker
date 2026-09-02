import { describe, expect, it } from "vitest"
import {
  isPopularFixture,
  isPopularTeamName,
  POPULAR_TEAM_ALIASES,
  popularTeamSlugsMissingAliases,
} from "@/lib/match/popular-teams"
import { TEAM_BOARDS } from "@/lib/constants/team-boards"

/**
 * 인기 팀 예외 (2026-09-02 운영자: 일정은 베트맨 기준, 빅6·인기 팀 경기는 베트맨에 없어도 싣는다).
 * LFA 실제 표기(2026-08-10~ day cache 실측)로 시험한다.
 */
describe("POPULAR_TEAM_ALIASES — 팀 게시판 레지스트리와 같은 14팀", () => {
  it("레지스트리의 모든 팀에 별칭이 있고, 별칭 표에 레지스트리 밖 팀이 없다", () => {
    expect(popularTeamSlugsMissingAliases()).toEqual([])
    const extra = Object.keys(POPULAR_TEAM_ALIASES).filter((s) => !TEAM_BOARDS[s])
    expect(extra).toEqual([])
    expect(Object.keys(POPULAR_TEAM_ALIASES)).toHaveLength(14)
  })
})

describe("isPopularTeamName — LFA 실제 표기 정확일치", () => {
  it("LFA 축약·타언어 표기를 안다", () => {
    for (const n of [
      "Man. City",
      "Man Utd",
      "Man. United",
      "Atl. Madrid",
      "Bayern Münih",
      "Bayern Munich",
      "B. Dortmund",
      "Milan",
      "Inter",
      "Tottenham",
      "Real Madrid",
      "Barcelona",
      "Juventus",
      "Arsenal",
      "Chelsea",
      "Liverpool",
    ]) {
      expect(isPopularTeamName(n), n).toBe(true)
    }
  })

  it("사전 한글 표기도 안다 (toKorean 을 거친 행)", () => {
    for (const n of [
      "바이에른 뮌헨",
      "맨체스터 유나이티드",
      "아틀레티코 마드리드",
      "인테르",
      "AC밀란",
    ]) {
      expect(isPopularTeamName(n), n).toBe(true)
    }
  })

  it("동명 구단·2군·유소년은 인기 팀이 아니다 — 토큰 겹침이 아니라 정확일치인 이유", () => {
    for (const n of [
      "Barcelona SC",
      "Inter Turku",
      "Inter Miami",
      "Arsenal Tula",
      "Arsenal Sarandi",
      "Bayern II",
      "Dortmund II",
      "Juventus U20",
      "Liverpool M.",
      "Man. City U21",
      "Osnabrück",
      "HEBC",
      "",
    ]) {
      expect(isPopularTeamName(n), n).toBe(false)
    }
    expect(isPopularTeamName(null)).toBe(false)
  })
})

describe("isPopularFixture", () => {
  it("포칼에서 하부리그 팀을 만난 바이에른 — 베트맨에 없어도 싣는다", () => {
    expect(
      isPopularFixture({
        homeTeam: "Osnabrück",
        awayTeam: "바이에른 뮌헨",
        homeTeamEn: "Osnabrück",
        awayTeamEn: "Bayern Munich",
      })
    ).toBe(true)
  })

  it("인기 팀이 없는 컵 경기는 싣지 않는다", () => {
    expect(
      isPopularFixture({
        homeTeam: "파르마",
        awayTeam: "Cremonese",
        homeTeamEn: "Parma",
        awayTeamEn: "Cremonese",
      })
    ).toBe(false)
  })

  it("영문 원명이 없는 행은 한글 이름만으로도 판정한다", () => {
    expect(isPopularFixture({ homeTeam: "레알 마드리드", awayTeam: "말라가" })).toBe(true)
  })
})
