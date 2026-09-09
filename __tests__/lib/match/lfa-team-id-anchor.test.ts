import { describe, expect, it } from "vitest"
import { matchLfaCounterpart, teamIdIndex, type TeamSided } from "@/lib/match/pair-fixtures"

/**
 * betman ↔ LFA 짝짓기 — **팀 고유번호 근거** (2026-09-10).
 *
 * 실사고: 9/11 04:00 UCL 맨유–사바FK 가 LFA 링크를 못 얻었다. LFA 원명 "Man. United" 와
 * 사전 영문 "Manchester United" 가 글자로 안 맞고, 상대 "Sabah" 도 사전 "Sabah Baku" 와 다르다.
 * 그런데 사전엔 맨유의 LFA 팀 고유번호(6eqit8ye…)가 이미 있었고, 화면 표기(toKorean)는 그 번호로
 * "맨체스터 유나이티드"를 제대로 붙이고 있었다 — 짝짓기만 번호를 안 봤다.
 *
 * 규칙: 번호가 같으면 표기와 무관하게 같은 팀. 번호 불일치만으로는 거절하지 않는다(사전 번호
 * 오매핑 사례 2026-09-03). 상대 팀의 사전 충돌·홈/원정 반전은 여전히 보류 사유다.
 */

const TEAM_EN = new Map<string, string>([
  ["맨체스터 유나이티드", "Manchester United"],
  ["맨유", "Manchester United"],
  ["사바FK", "Sabah Baku"],
  ["맨체스터 시티", "Manchester City"],
  ["첼시", "Chelsea"],
])

const MAN_UTD = "6eqit8ye8aomdsrrq0hk3v7gh"
const SABAH = "evvhmz4bq4dq1v9llaev1j97u"
const MAN_CITY = "man-city-id"
const CHELSEA = "chelsea-id"

const TEAM_IDS = teamIdIndex([
  ["맨체스터 유나이티드", MAN_UTD],
  ["맨유", MAN_UTD],
  ["사바FK", SABAH],
  ["맨체스터 시티", MAN_CITY],
  ["첼시", CHELSEA],
])

const slot = { leagueCode: "UCL", matchTime: "2026-09-10T19:00:00Z" }
const betman = (homeTeam: string, awayTeam: string): TeamSided => ({ homeTeam, awayTeam, ...slot })
const lfa = (
  homeTeamEn: string,
  awayTeamEn: string,
  ids: { home?: string; away?: string } = {}
): TeamSided => ({
  // toKorean 을 거친 뒤의 표시명 — 번호로 풀린 쪽은 한글, 못 푼 쪽은 원명 그대로
  homeTeam: homeTeamEn,
  awayTeam: awayTeamEn,
  homeTeamEn,
  awayTeamEn,
  homeTeamId: ids.home,
  awayTeamId: ids.away,
  ...slot,
})

describe("teamIdIndex — 한글 → LFA 팀 번호 색인", () => {
  it("이름을 normTeam 으로 접어 키로 쓴다", () => {
    expect(TEAM_IDS.get("맨체스터유나이티드")).toBe(MAN_UTD)
    expect(TEAM_IDS.get("맨유")).toBe(MAN_UTD)
  })
  it("같은 이름이 서로 다른 번호를 가리키면 그 이름은 뺀다", () => {
    const idx = teamIdIndex([
      ["플라텐세", "arg-platense"],
      ["플라텐세", "hon-platense"],
      ["첼시", CHELSEA],
    ])
    expect(idx.has("플라텐세")).toBe(false)
    expect(idx.get("첼시")).toBe(CHELSEA)
  })
  it("같은 이름에 같은 번호가 두 번 오면 그대로 둔다 (정본 + 보조 사전 중복)", () => {
    const idx = teamIdIndex([
      ["첼시", CHELSEA],
      ["첼시", CHELSEA],
    ])
    expect(idx.get("첼시")).toBe(CHELSEA)
  })
  it("빈 이름·빈 번호는 무시한다", () => {
    const idx = teamIdIndex([
      ["", "x"],
      ["첼시", ""],
    ])
    expect(idx.size).toBe(0)
  })
})

describe("팀 번호가 짝짓기의 첫 근거다 (맨유–사바 재현)", () => {
  const game = betman("맨체스터 유나이티드", "사바FK")
  const candidate = lfa("Man. United", "Sabah", { home: MAN_UTD, away: SABAH })

  it("번호 없이 이름만 보면 지금처럼 실패한다 — 사고 재현", () => {
    const named = lfa("Man. United", "Sabah")
    expect(matchLfaCounterpart(game, [named], TEAM_EN).status).toBe("missing")
  })

  it("번호가 양쪽 다 맞으면 both 로 연결한다", () => {
    expect(matchLfaCounterpart(game, [candidate], TEAM_EN, TEAM_IDS)).toEqual({
      status: "matched",
      candidate,
      anchor: "both",
    })
  })

  it("한 팀 번호만 맞아도 연결한다 (상대는 미등록)", () => {
    const oneSide = lfa("Man. United", "Sabah", { home: MAN_UTD })
    expect(matchLfaCounterpart(game, [oneSide], TEAM_EN, TEAM_IDS)).toEqual({
      status: "matched",
      candidate: oneSide,
      anchor: "home",
    })
  })

  it("번호 불일치만으로는 거절하지 않고 이름 대조로 내려간다 — 결과는 종전과 같다", () => {
    // 사전 번호가 틀린 상황: 이름으로도 못 잇는다면 missing (거짓 연결도, 거짓 거절도 없다)
    const wrongId = lfa("Man. United", "Sabah", { home: "someone-else", away: "another" })
    expect(matchLfaCounterpart(game, [wrongId], TEAM_EN, TEAM_IDS).status).toBe("missing")
  })

  it("상대 팀이 사전상 다른 팀이면 번호가 맞아도 보류한다", () => {
    // 홈은 맨유 번호가 맞지만, 원정이 사전에 '맨시티'로 확정되는 후보 → 다른 경기다
    const clash = lfa("Man. United", "Manchester City", { home: MAN_UTD, away: MAN_CITY })
    expect(matchLfaCounterpart(game, [clash], TEAM_EN, TEAM_IDS).status).toBe("conflict")
  })

  it("홈/원정이 뒤집힌 후보는 번호가 맞아도 보류한다", () => {
    const flipped = lfa("Sabah", "Man. United", { home: SABAH, away: MAN_UTD })
    expect(matchLfaCounterpart(game, [flipped], TEAM_EN, TEAM_IDS).status).toBe("conflict")
  })

  it("동시 킥오프 여러 후보 중 번호로 하나만 남으면 그것을 고른다", () => {
    const others = [
      lfa("Chelsea", "Someone", { home: CHELSEA }),
      candidate,
      lfa("Man. City", "Other", { home: MAN_CITY }),
    ]
    expect(matchLfaCounterpart(game, others, TEAM_EN, TEAM_IDS).candidate).toBe(candidate)
  })

  it("teamIds 를 안 주면 종전 동작 그대로다 (호출부 호환)", () => {
    const plain = betman("첼시", "맨체스터 시티")
    const named = lfa("Chelsea", "Manchester City")
    expect(matchLfaCounterpart(plain, [named], TEAM_EN)).toEqual({
      status: "matched",
      candidate: named,
      anchor: "both",
    })
  })
})
