import { describe, it, expect } from "vitest"
import { pickLfaCounterpart } from "@/lib/match/pair-fixtures"

/**
 * betman ↔ LFA 짝짓기 (2026-08-30 실사고 재현).
 *
 * 증상: 일요일 EPL 3경기(22:00)와 세리에A 2경기(03:45)가 `/matches` 에서 매치 링크를
 * 잃었다. 링크가 없으면 불판도 안 깔리고 lfa-warm 예열 대상에서도 빠져 그 경기의
 * 라인업·스탯·타임라인·MOM·리포트가 통째로 끊긴다. 첼시가 2-0 으로 뛰는데 사용자가
 * 매치 페이지에 들어갈 방법이 없었다.
 *
 * 실측 판별자: **같은 (리그, 킥오프) 슬롯에 경기가 2개 이상이면 전멸**, 1개면 전부 성공.
 * 후보가 1개면 무조건 채택하는 분기가 있으므로, 이는 이름 대조가 한 번도 성공하지
 * 못했음을 뜻한다.
 */

interface Row {
  matchKey: string
  gameId: string | null
  homeTeam: string
  awayTeam: string
  leagueCode: string
  matchTime: string
  status: string
  homeScore: number | null
  awayScore: number | null
}

const lfa = (homeTeam: string, awayTeam: string): Row =>
  ({
    matchKey: `lfa_${homeTeam}`,
    gameId: null,
    homeTeam,
    awayTeam,
    leagueCode: "EPL",
    matchTime: "2026-08-30T13:00:00.000Z",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
  }) as Row

const betman = (homeTeam: string, awayTeam: string): Row =>
  ({
    matchKey: `${homeTeam}_${awayTeam}`,
    gameId: "00000000-0000-0000-0000-000000000001",
    homeTeam,
    awayTeam,
    leagueCode: "EPL",
    matchTime: "2026-08-30T13:00:00.000Z",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
  }) as Row

/** 2026-08-30 프로덕션 team_dictionary 실측값 (SQL 로 확인) */
const TEAM_EN = new Map<string, string>([
  ["첼시", "Chelsea"],
  ["브라이턴&호브 앨비언", "Brighton"],
  ["리즈 유나이티드", "Leeds"],
  ["브렌트퍼드", "Brentford"],
  ["선덜랜드", "Sunderland"],
  ["풀럼", "Fulham"],
])

/** 그날 13:00 UTC EPL 슬롯의 LFA 후보 3개 (lfa_day_cache 실측) */
const CANDIDATES = [
  lfa("Chelsea", "Brighton"),
  lfa("Leeds United", "Brentford"),
  lfa("Sunderland", "Fulham"),
]

describe("pickLfaCounterpart — 2026-08-30 EPL 동시 킥오프 3경기", () => {
  it("후보가 하나면 이름 대조 없이 채택한다 (오늘 성공한 경기들의 경로)", () => {
    const only = lfa("Paris FC", "Nice")
    expect(pickLfaCounterpart(betman("파리FC", "OGC니스"), [only], new Map())).toBe(only)
  })

  it("첼시 vs 브라이턴 — 후보 3개 중 정확히 하나를 골라야 한다", () => {
    const hit = pickLfaCounterpart(betman("첼시", "브라이턴&호브 앨비언"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("Chelsea")
  })

  it("리즈 vs 브렌트퍼드 — LFA 는 'Leeds United', 사전은 'Leeds'", () => {
    const hit = pickLfaCounterpart(betman("리즈 유나이티드", "브렌트퍼드"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("Leeds United")
  })

  it("선덜랜드 vs 풀럼", () => {
    const hit = pickLfaCounterpart(betman("선덜랜드", "풀럼"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("Sunderland")
  })

  it("⚠️ 사전이 비면 전멸한다 — 이것이 오늘 증상과 같은 모양인지 본다", () => {
    const hit = pickLfaCounterpart(betman("첼시", "브라이턴&호브 앨비언"), CANDIDATES, new Map())
    // 사전이 없으면 영문↔한글 접두 비교만 남아 아무것도 못 고른다
    expect(hit).toBeNull()
  })
})
