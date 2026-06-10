import { describe, it, expect } from "vitest"
import { dedupeMarketRows, marketSignature } from "@/lib/betman/market-dedup"

// Regression: ISSUE-002 — 같은 경기가 betman 여러 라운드에 중복 등록되면
// 동일 마켓 row 가 ×N 으로 복제되어 월드컵/메인 베팅 카드에 "승무패 ×3" 노출.
// Found by /qa on 2026-06-11
// Report: .gstack/qa-reports/qa-report-localhost-2026-06-11.md

function row(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    game_type: "일반",
    handicap: null,
    over_under_line: null,
    home_win_odds: "1.36",
    away_win_odds: "8.40",
    draw_odds: "3.90",
    over_odds: null,
    under_odds: null,
    odd_odds: null,
    even_odds: null,
    ...over,
  }
}

describe("dedupeMarketRows", () => {
  it("라운드 교차 완전 중복(타입·핸디·라인·배당 동일)은 첫 row 만 유지한다", () => {
    // ISSUE-002 실데이터 형태: 멕시코 vs 남아공 — 같은 승무패 마켓이 3개 라운드에 등록
    const games = [row({ id: "r1-g1" }), row({ id: "r2-g1" }), row({ id: "r3-g1" })]
    const out = dedupeMarketRows(games)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("r1-g1") // keep-first (game_no asc 정렬 후 첫 등장)
  })

  it("같은 키라도 배당이 다른 진짜 전반전 row 는 보존한다", () => {
    // 풀타임 1.36/3.90/8.40 vs 전반 1.87/2.05/8.80 — 휴리스틱 1의 입력이 되어야 함
    const games = [
      row({ id: "full" }),
      row({ id: "half", home_win_odds: "1.87", draw_odds: "2.05", away_win_odds: "8.80" }),
    ]
    const out = dedupeMarketRows(games)
    expect(out).toHaveLength(2)
    expect(out.map((g) => g.id)).toEqual(["full", "half"])
  })

  it("중복 ×3 + 전반 ×3 혼합(ISSUE-002 원형)은 풀타임 1 + 전반 1 로 줄인다", () => {
    const full = (id: string) => row({ id })
    const half = (id: string) =>
      row({ id, home_win_odds: "1.87", draw_odds: "2.05", away_win_odds: "8.80" })
    const out = dedupeMarketRows([
      full("r1-f"),
      half("r1-h"),
      full("r2-f"),
      half("r2-h"),
      full("r3-f"),
      half("r3-h"),
    ])
    expect(out.map((g) => g.id)).toEqual(["r1-f", "r1-h"])
  })

  it("다른 마켓 타입(핸디캡·언더오버·SUM)은 서로 충돌하지 않는다", () => {
    const games = [
      row({ id: "wdl" }),
      row({ id: "hcp", game_type: "핸디캡", handicap: -1.5, home_win_odds: "2.10" }),
      row({
        id: "ou",
        game_type: "언더오버",
        over_under_line: 2.5,
        home_win_odds: null,
        draw_odds: null,
        away_win_odds: null,
        over_odds: "1.90",
        under_odds: "1.85",
      }),
      row({
        id: "sum",
        game_type: "SUM",
        home_win_odds: null,
        draw_odds: null,
        away_win_odds: null,
        odd_odds: "1.85",
        even_odds: "1.85",
      }),
    ]
    expect(dedupeMarketRows(games)).toHaveLength(4)
  })

  it("SUM 중복도 1개는 남긴다 (전반전 휴리스틱 2의 디스크리미네이터 보존)", () => {
    const sum = (id: string) =>
      row({
        id,
        game_type: "SUM",
        home_win_odds: null,
        draw_odds: null,
        away_win_odds: null,
        odd_odds: "1.85",
        even_odds: "1.85",
      })
    const out = dedupeMarketRows([sum("r1-s"), sum("r2-s"), sum("r3-s")])
    expect(out).toHaveLength(1)
  })

  it("null 과 undefined 는 같은 값으로 정규화한다", () => {
    expect(marketSignature(row({ handicap: null }))).toBe(
      marketSignature(row({ handicap: undefined }))
    )
  })
})
