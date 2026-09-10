import { describe, expect, it } from "vitest"
import { getExcludedMarketIds } from "@/lib/betman/market-scope"
import { periodMarkets } from "./__fixtures__/period-markets"

describe("market scope", () => {
  it("이번 경기의 풀타임 4개는 유지하고 SUM 및 전반 3개를 제외한다", () => {
    expect([...getExcludedMarketIds([...periodMarkets].reverse())].sort()).toEqual([
      "595",
      "596",
      "597",
      "598",
    ])
  })
  it("별도 라운드의 풀타임을 이전 SUM 이후 전반으로 오인하지 않는다", () => {
    const other = periodMarkets
      .slice(0, 4)
      .map((r) => ({ ...r, id: r.id + "b", round_id: "round-2", game_no: r.game_no + 100 }))
    expect([...getExcludedMarketIds([...periodMarkets, ...other])].sort()).toEqual([
      "595",
      "596",
      "597",
      "598",
    ])
  })
  it("단독 S 마켓도 제외하며 SUM 없이 중복 키·다른 배당인 전반을 제외한다", () => {
    const normal = { ...periodMarkets[0], home_win_odds: 2 }
    const rows = [
      normal,
      { ...normal, id: "copy", game_no: 592 },
      { ...normal, id: "half", game_no: 596, home_win_odds: 3 },
      { ...normal, id: "explicit", game_type: "S언더오버", round_id: "other" },
    ]
    expect([...getExcludedMarketIds(rows)].sort()).toEqual(["explicit", "half"])
  })
  it("팀 이름이 같아도 다른 경기·리그의 SUM과 섞지 않는다", () => {
    const single = { ...periodMarkets[7], id: "different", league_code: "other" }
    expect(getExcludedMarketIds([...periodMarkets, single]).has(single.id)).toBe(false)
  })
})
