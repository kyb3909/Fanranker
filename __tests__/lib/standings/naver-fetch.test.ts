import { describe, it, expect } from "vitest"
import { parseTeamsResponse } from "@/lib/standings/naver-fetch"

/**
 * 네이버 api-gw 순위 파서 — standings_cache.data 의 한글 키 계약을 잠근다.
 * 위젯 렌더러가 팀명/경기/승점/골득실/승/무/패 키를 그대로 읽으므로
 * 키가 바뀌면 순위 위젯이 통째로 빈다 (2026-08-06, 단계 0-2 에서 lib 추출하며 추가).
 */
describe("parseTeamsResponse", () => {
  it("seasonTeamStats 응답 → 한글 키 행", () => {
    const rows = parseTeamsResponse({
      result: {
        seasonTeamStats: [
          {
            teamName: "아스날",
            matchesPlayed: 38,
            points: 89,
            goalsDifference: 45,
            wins: 28,
            draws: 5,
            losses: 5,
          },
        ],
      },
    })
    expect(rows).toEqual([{ 팀명: "아스날", 경기: 38, 승점: 89, 골득실: 45, 승: 28, 무: 5, 패: 5 }])
  })

  it("필드명 변형(teams/win/lose)도 흡수한다", () => {
    const rows = parseTeamsResponse({
      result: {
        teams: [{ name: "리버풀", played: 10, pts: 22, gd: 8, win: 7, draw: 1, lose: 2 }],
      },
    })
    expect(rows[0]).toMatchObject({ 팀명: "리버풀", 승점: 22, 승: 7, 패: 2 })
  })

  it("팀명 없는 행·비객체 응답은 버린다", () => {
    expect(parseTeamsResponse(null)).toEqual([])
    expect(parseTeamsResponse({ result: { teams: [{ points: 3 }] } })).toEqual([])
  })

  it("conf/division 이 있으면 group/division 으로 병기 (MLB 지구 표시)", () => {
    const rows = parseTeamsResponse({
      result: {
        teams: [{ teamName: "LA 다저스", conf: "NL", division: "West", points: 0 }],
      },
    })
    expect(rows[0]).toMatchObject({ 팀명: "LA 다저스", group: "NL", division: "West" })
  })
})
