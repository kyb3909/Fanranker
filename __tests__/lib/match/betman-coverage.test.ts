import { describe, expect, it } from "vitest"
import { predictBetmanListing } from "@/lib/match/betman-coverage"

const empty = new Set<string>()
const members = (code: string) =>
  new Set(
    (
      {
        EPL: ["Chelsea", "Liverpool"],
        EFL챔: ["Leicester City"],
        분데스리: ["Bayern Munich", "Dortmund"],
        라리가: ["Barcelona", "Real Madrid"],
        세리에A: ["Milan", "Juventus"],
        프리그1: ["PSG", "Monaco"],
      } as Record<string, string[]>
    )[code] ?? []
  )
const fixture = (leagueCode: string, homeTeamEn = "Chelsea", awayTeamEn = "Liverpool") => ({
  leagueCode,
  homeTeamEn,
  awayTeamEn,
  homeTeam: "표시명 변경",
  awayTeam: "별칭",
})

describe("베트맨 발매 범위", () => {
  it.each(["EPL", "라리가", "세리에A", "분데스리", "프리그1", "UCL", "UEL", "UECL", "U슈퍼컵"])(
    "%s는 멤버 목록 없이도 당일 발매를 기다린다",
    (code) => {
      expect(predictBetmanListing(fixture(code), () => empty)).toBe("will_list")
    }
  )
  it.each(["잉글FA컵", "잉리그컵", "잉슈퍼컵"])("%s는 2부까지 발매, 3부는 미판매", (code) => {
    expect(predictBetmanListing(fixture(code, "Chelsea", "Leicester City"), members)).toBe(
      "will_list"
    )
    expect(predictBetmanListing(fixture(code, "Chelsea", "Luton"), members)).toBe("never")
  })
  it.each([
    ["독일FA컵", "Bayern Munich", "Dortmund"],
    ["스페FA컵", "Barcelona", "Real Madrid"],
    ["이탈FA컵", "Milan", "Juventus"],
    ["프랑FA컵", "PSG", "Monaco"],
    ["프슈퍼컵", "PSG", "Monaco"],
  ])("%s는 자국 1부 멤버만 발매한다", (code, home, away) => {
    expect(predictBetmanListing(fixture(code, home, away), members)).toBe("will_list")
    expect(predictBetmanListing(fixture(code, home, "Lower League FC"), members)).toBe("never")
  })
  it.each([
    ["Osnabrück", "Bayern Munich"],
    ["HEBC", "Dortmund"],
  ])("%s–%s 포칼 경기는 즉시 등록 대상이다", (home, away) => {
    expect(predictBetmanListing(fixture("독일FA컵", home, away), members)).toBe("never")
  })
  it("목록이 없거나 잉글랜드 2부 목록만 없어도 unknown이다", () => {
    expect(predictBetmanListing(fixture("독일FA컵"), () => empty)).toBe("unknown")
    expect(
      predictBetmanListing(fixture("잉글FA컵"), (code) =>
        code === "EFL챔" ? empty : members(code)
      )
    ).toBe("unknown")
  })
  it("영문 원명이 없으면 표시명으로 추정하지 않는다", () => {
    expect(predictBetmanListing({ ...fixture("잉글FA컵"), awayTeamEn: undefined }, members)).toBe(
      "unknown"
    )
    expect(predictBetmanListing(fixture("미지원컵"), members)).toBe("unknown")
  })
})
