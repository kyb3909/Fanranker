import { describe, expect, it } from "vitest"
import { auditLfaLinks, linkTeamsAgree, summarizeLinkAudit } from "@/lib/ops/lfa-link-audit"
import { teamMatches } from "@/lib/match/pair-fixtures"

/**
 * betman↔LFA 링크 팀명 대조 (2026-09-02). 14일 실측 136경기의 이름 쌍을 그대로 옮겼다 —
 * LFA 축약형("Man. City", "Not. Forest", "S. Bratislava")과 사전 정식명이 같은 팀으로 읽혀야 하고,
 * 다른 팀은 갈라져야 한다.
 */

const TEAM_EN = new Map<string, string>([
  ["첼시", "Chelsea"],
  ["브라이턴&호브 앨비언", "Brighton"],
  ["맨체스터 시티", "Manchester City"],
  ["AFC본머스", "Bournemouth"],
  ["노팅엄 포리스트", "Not. Forest"],
  ["리즈 유나이티드", "Leeds"],
  ["올랭피크드 마르세유", "Marseille"],
  ["RC스트라스부르", "Strasbourg"],
  ["아스널", "Arsenal"],
  ["토트넘 홋스퍼", "Tottenham"],
])

const LFA = new Map([
  ["m-chelsea", { id: "m-chelsea", homeName: "Chelsea", awayName: "Brighton" }],
  ["m-city", { id: "m-city", homeName: "Man. City", awayName: "Bournemouth" }],
  ["m-forest", { id: "m-forest", homeName: "Not. Forest", awayName: "Leeds United" }],
  ["m-om", { id: "m-om", homeName: "Marsilya", awayName: "Strasbourg" }],
  ["m-spurs", { id: "m-spurs", homeName: "Tottenham", awayName: "Arsenal" }],
])

const linked = (gameId: string, homeKr: string, awayKr: string, lfaMatchId: string) => ({
  gameId,
  label: `${homeKr} v ${awayKr}`,
  homeKr,
  awayKr,
  lfaMatchId,
})

describe("linkTeamsAgree", () => {
  it("LFA 축약형과 사전 정식명이 같은 팀으로 읽힌다", () => {
    expect(linkTeamsAgree(LFA.get("m-city")!, "Manchester City", "Bournemouth")).toBe(true)
    expect(linkTeamsAgree(LFA.get("m-forest")!, "Not. Forest", "Leeds")).toBe(true)
  })

  it("사전이 한쪽이라도 모르면 판정하지 않는다 (null)", () => {
    expect(linkTeamsAgree(LFA.get("m-chelsea")!, "Chelsea", null)).toBeNull()
    expect(linkTeamsAgree(LFA.get("m-chelsea")!, undefined, "Brighton")).toBeNull()
  })

  it("LFA 터키식 표기 Marsilya 는 Marseille 로 읽힌다 (14일 실측의 유일한 헛거절)", () => {
    expect(teamMatches("Marsilya", "Marseille")).toBe(true)
    expect(teamMatches("CSKA Sofya", "CSKA Sofia")).toBe(true)
    expect(linkTeamsAgree(LFA.get("m-om")!, "Marseille", "Strasbourg")).toBe(true)
  })
})

describe("auditLfaLinks", () => {
  it("맞게 붙은 링크는 ok", () => {
    const v = auditLfaLinks(
      [
        linked("g1", "첼시", "브라이턴&호브 앨비언", "m-chelsea"),
        linked("g2", "맨체스터 시티", "AFC본머스", "m-city"),
        linked("g3", "올랭피크드 마르세유", "RC스트라스부르", "m-om"),
      ],
      LFA,
      TEAM_EN
    )
    expect(v.map((x) => x.status)).toEqual(["ok", "ok", "ok"])
  })

  it("남의 경기에 붙은 링크는 mismatch — 오연결 시나리오(같은 시각 유일 후보)", () => {
    const v = auditLfaLinks([linked("g1", "첼시", "브라이턴&호브 앨비언", "m-spurs")], LFA, TEAM_EN)
    expect(v[0].status).toBe("mismatch")
    expect(v[0].lfaHome).toBe("Tottenham")
    expect(v[0].homeEn).toBe("Chelsea")
  })

  it("사전에 없는 팀은 unknown_team, 그날 사본에 없는 id 는 no_day_cache — 둘 다 finding 이 아니다", () => {
    const v = auditLfaLinks(
      [
        linked("g1", "아라라트 아르메니아", "크라이오바", "m-chelsea"),
        linked("g2", "첼시", "브라이턴&호브 앨비언", "m-missing"),
      ],
      LFA,
      TEAM_EN
    )
    expect(v.map((x) => x.status)).toEqual(["unknown_team", "no_day_cache"])
    expect(summarizeLinkAudit(v)).toEqual({ ok: 0, mismatch: 0, unknown_team: 1, no_day_cache: 1 })
  })
})
