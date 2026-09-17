import { describe, it, expect } from "vitest"
import {
  dedupeMarketRows,
  marketSignature,
  MarketRoundError,
  type CurrentMarketRow,
} from "@/lib/betman/market-dedup"

function row(over: Partial<CurrentMarketRow> = {}): CurrentMarketRow {
  return {
    id: "old",
    round_id: "round-109",
    market_round: { gm_ts: "260109", year: 2026, round: 109 },
    game_no: 10,
    sport: "축구",
    league_code: "EPL",
    home_team_name: "아스날",
    away_team_name: "리버풀",
    match_time: "2026-09-18T10:00:00Z",
    game_type: "일반",
    handicap: null,
    over_under_line: null,
    home_win_odds: 1.36,
    away_win_odds: 8.4,
    draw_odds: 3.9,
    ...over,
  }
}
function newer(over: Partial<CurrentMarketRow> = {}) {
  return row({
    id: "new",
    round_id: "round-110",
    market_round: { gm_ts: "260110", year: 2026, round: 110 },
    game_no: 99,
    ...over,
  })
}

describe("current full-time market selection", () => {
  it.each([1.36, 1.5])("배당 %s: 가격과 배열 순서에 관계없이 최신 회차를 선택한다", (odds) => {
    const latest = newer({ home_win_odds: odds })
    expect(dedupeMarketRows([row(), latest])).toEqual([latest])
    expect(dedupeMarketRows([latest, row()])).toEqual([latest])
  })

  it("같은 회차의 완전 중복은 낮은 game_no, 같은 번호면 id로 고른다", () => {
    const winner = row({ id: "a" })
    expect(dedupeMarketRows([row({ id: "z" }), row({ game_no: 20 }), winner])).toEqual([winner])
  })

  it("종목·리그·팀·시각·마켓 종류·기준점이 다르면 각각 보존한다", () => {
    const games = [
      row(),
      row({ id: "sport", sport: "농구" }),
      row({ id: "league", league_code: "UCL" }),
      row({ id: "teams", home_team_name: "첼시" }),
      row({ id: "time", match_time: "2026-09-19T10:00:00Z" }),
      row({ id: "hcp1", game_type: "핸디캡", handicap: -1 }),
      row({ id: "hcp2", game_type: "핸디캡", handicap: -2 }),
      row({ id: "ou1", game_type: "언더오버", over_under_line: 2.5 }),
      row({ id: "ou2", game_type: "언더오버", over_under_line: 3.5 }),
    ]
    expect(dedupeMarketRows(games)).toEqual(games)
  })

  it("동일 시각의 다른 타임존 표기도 같은 경기로 처리한다", () => {
    const latest = newer({ match_time: "2026-09-18T19:00:00+09:00" })
    expect(dedupeMarketRows([row(), latest])).toEqual([latest])
  })

  it("연도 경계와 gm_ts가 없는 구형 회차도 순서대로 비교한다", () => {
    const latest = newer({ market_round: { gm_ts: null, year: 2027, round: 1 } })
    expect(dedupeMarketRows([latest, row()])).toEqual([latest])
    expect(
      dedupeMarketRows([
        row(),
        newer({ market_round: { gm_ts: null, year: 2026, round: 260110 } }),
      ])[0].id
    ).toBe("new")
  })

  it.each([
    { market_round: null },
    { market_round: [] },
    { round_id: null },
    { market_round: { gm_ts: "bad", year: 2026, round: 110 } },
    { market_round: { gm_ts: "260000", year: 2026, round: 0 } },
    { market_round: { gm_ts: "250110", year: 2026, round: 110 } },
    { market_round: { gm_ts: null, year: 2026, round: 250110 } },
  ])("회차를 확인할 수 없으면 오래된 선택으로 대체하지 않는다 (%j)", (over) => {
    expect(() => dedupeMarketRows([row(), newer(over)])).toThrow(MarketRoundError)
  })

  it("서로 다른 회차 ID의 순번이 같으면 명확한 순서를 요구한다", () => {
    expect(() => dedupeMarketRows([row(), row({ round_id: "ambiguous" })])).toThrow(
      MarketRoundError
    )
  })

  it("단일 회차 배열 응답도 지원하지만 여러 회차는 거부한다", () => {
    const metadata = { gm_ts: "260110", year: 2026, round: 110 }
    const latest = newer({ market_round: [metadata] })
    expect(dedupeMarketRows([row(), latest])).toEqual([latest])
    expect(() => dedupeMarketRows([newer({ market_round: [metadata, metadata] })])).toThrow(
      MarketRoundError
    )
  })

  it("전반전 분류용 배당 서명은 유지한다", () => {
    expect(marketSignature(row({ handicap: null }))).toBe(
      marketSignature(row({ handicap: undefined }))
    )
    expect(marketSignature(row())).not.toBe(marketSignature(row({ home_win_odds: 1.5 })))
  })
})
