import { expect, it } from "vitest"
import {
  assertLabelOnly,
  relocalizeLineup,
  relocalizeMotm,
} from "@/lib/dictionary/relocalize-labels"
import { playerForMotmOption, type MotmOption } from "@/lib/motm/options"
import type { LineupResponse } from "@/lib/match/lineup-types"
const lineup = (): Extract<LineupResponse, { status: "ready" }> => ({
  status: "ready",
  source: "lfa",
  matchId: "match",
  projected: false,
  kickoff: "2026-09-15T14:00:00Z",
  fetchedAt: "2026-09-15T13:00:00Z",
  observation: { id: "obs", requestedAt: "original", fingerprint: "original" },
  home: {
    teamLabel: "토트넘",
    formation: "4-3-3",
    starters: [
      {
        id: "solanke",
        roman: "D. Solanke",
        label: "D. Solanke",
        number: 19,
        goals: 1,
        subOut: "80'",
      },
    ],
    bench: [],
  },
  away: {
    teamLabel: "다른 팀",
    formation: null,
    starters: [{ id: "solanke", roman: "D. Solanke", label: "D. Solanke", number: 19 }],
    bench: [],
  },
})
const lookup = (team: string) =>
  team === "토트넘"
    ? [
        { playerId: "solanke", source: "lfa", nameEn: "D. Solanke", nameKr: "도미닉 솔랑케" },
        { playerId: "sw", source: "namu", nameEn: "Solanke Dominic", nameKr: "도미닉 솔랑케" },
      ]
    : []
const option = (): MotmOption => ({
  key: "h-d-solanke",
  label: "D. Solanke",
  team: "home",
  team_label: "토트넘",
  number: 19,
  group: "starter",
})
it("확정 기록의 ID·시각·관측·점수·등번호·포메이션을 보존하고 팀 안에서만 바꾼다", () => {
  const before = lineup(),
    { after, decisions } = relocalizeLineup(before, lookup)
  expect(after.status === "ready" && after.home.starters[0].label).toBe("도미닉 솔랑케")
  expect(after.status === "ready" && after.away.starters[0].label).toBe("D. Solanke")
  expect(before.home.starters[0].label).toBe("D. Solanke")
  assertLabelOnly(before, after, decisions)
})
it("기존 한글 표기는 보존하며 재실행은 멱등이다", () => {
  const first = relocalizeLineup(lineup(), lookup)
  expect(relocalizeLineup(first.after, lookup).after).toEqual(first.after)
})
it("출처 없는 역사 기록의 ID 체계를 추측하지 않는다 — 후보 전원이 같은 한글일 때만 표기를 합의한다", () => {
  const before = lineup()
  delete before.source
  const { after, decisions } = relocalizeLineup(before, lookup)
  expect(decisions.map((d) => d.reason)).toEqual(["unanimous-name", "unmatched"])
  expect(after.status === "ready" && after.home.starters[0].label).toBe("도미닉 솔랑케")
  expect(after.status === "ready" && after.away.starters[0].label).toBe("D. Solanke")
})
it("투표 옵션을 같은 경기의 로마자 key·편·팀·번호로 연결하고 key를 보존한다", () => {
  const before = [option()]
  const { after, decisions } = relocalizeMotm(before, lineup(), lookup)
  expect(after[0]).toEqual({ ...before[0], label: "도미닉 솔랑케" })
  assertLabelOnly(before, after, decisions)
})
it.each([{ number: 20 }, { team_label: "상대" }, { key: "h-d-solanke-2" }, { group: "sub" }])(
  "옵션 근거가 어긋나면 ID를 복구하지 않는다: %j",
  (extra) => {
    expect(playerForMotmOption({ ...option(), ...extra } as MotmOption, lineup())).toBeNull()
  }
)
it("같은 원문 key로 압축되는 선수 둘을 번호만으로 구별하지 않는다", () => {
  const l = lineup()
  l.home.bench.push({ ...l.home.starters[0], id: "other", number: 20 })
  expect(playerForMotmOption(option(), l)).toBeNull()
})
it("스냅샷 없이 투표 key만으로 공급자 ID를 추정하지 않는다", () => {
  const { after, decisions } = relocalizeMotm([option()], undefined, lookup)
  expect(decisions.map((d) => d.reason)).toEqual(["unanimous-name"])
  expect(after).toEqual([{ ...option(), label: "도미닉 솔랑케" }])
})
it("한글 이름을 고치며 key나 번호까지 바뀌면 저장 전에 실패한다", () => {
  const before = [option()],
    repair = relocalizeMotm(before, lineup(), lookup)
  repair.after[0].key = "new-key"
  expect(() => assertLabelOnly(before, repair.after, repair.decisions)).toThrow("non-label")
})
