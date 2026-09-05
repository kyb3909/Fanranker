import { expect, it } from "vitest"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
import type { LineupResponse } from "@/lib/match/lineup-types"
const lineup = (): LineupResponse => ({
  status: "ready",
  projected: false,
  kickoff: "2026-09-05T14:00:00Z",
  fetchedAt: "2026-09-05T13:00:00Z",
  home: {
    teamLabel: "토트넘",
    formation: null,
    starters: [{ id: "savio", label: "사비뉴", roman: "savinho", number: 17 }],
    bench: [{ id: "kudus", label: "쿠두스", roman: "kudus", number: 20 }],
  },
  away: { teamLabel: "상대", formation: null, starters: [], bench: [] },
})
it("이름이 달라도 같은 LFA ID의 교체 아웃·투입을 연결한다", () => {
  const out = enrichLineupWithTimeline(lineup(), [
    {
      kind: "sub",
      side: "home",
      minute: "61",
      player: "Savio",
      playerId: "savio",
      inPlayer: "Mohammed Kudus",
      inPlayerId: "kudus",
    },
  ])
  if (out.status !== "ready") throw Error("not ready")
  expect(out.home.starters[0].subOut).toBe("61'")
  expect(out.home.bench[0].subIn).toBe("61'")
})
it("이름이 같아도 다른 선수 ID이면 붙이지 않는다", () => {
  const out = enrichLineupWithTimeline(lineup(), [
    { kind: "sub", side: "home", minute: "61", player: "사비뉴", playerId: "other" },
  ])
  if (out.status !== "ready") throw Error("not ready")
  expect(out.home.starters[0].subOut).toBeUndefined()
})
