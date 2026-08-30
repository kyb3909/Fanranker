import { describe, it, expect } from "vitest"
import { mergeMotmOptions, pickRichestLineup, type MotmOption } from "@/lib/motm/options"
import type { LineupResponse } from "@/lib/soccerway/lineup-lookup"

/**
 * 2026-08-31 운영자 제보 — "MoTM 투표 명단에 교체 선수가 빠져 있다".
 *
 * 원인은 두 갈래였다: ① LFA 벤치를 못 읽어 후보가 선발 22명뿐이었고(lineup-shape),
 * ② 형제 행(같은 경기의 betman 다중 마켓) 중 **먼저 걸린** 라인업을 썼는데 그게
 * 하필 벤치 0 짜리였다. 여기서는 ②와 사후 보강의 안전성을 지킨다.
 */

const opt = (key: string, group: "starter" | "sub" = "starter"): MotmOption => ({
  key,
  label: key,
  number: null,
  team: "home",
  team_label: "첼시",
  group,
})

function lineup(homeBench: number, awayBench: number): LineupResponse {
  const p = (n: number) => ({ label: `p${n}`, number: n, roman: `p${n}` })
  const side = (bench: number) => ({
    teamLabel: "T",
    formation: null,
    starters: Array.from({ length: 11 }, (_, i) => p(i)),
    bench: Array.from({ length: bench }, (_, i) => p(100 + i)),
  })
  return {
    status: "ready",
    kickoff: "2026-08-30T13:00:00.000Z",
    home: side(homeBench),
    away: side(awayBench),
    fetchedAt: "2026-08-30T13:00:00.000Z",
  } as unknown as LineupResponse
}

describe("pickRichestLineup", () => {
  it("벤치가 있는 행이 이긴다 — 순서가 아니라 내용으로 고른다", () => {
    const got = pickRichestLineup([lineup(0, 0), lineup(9, 9)])
    expect(got!.home.bench).toHaveLength(9)
  })

  it("전부 벤치 0 이면 그래도 하나는 준다 (선발만이라도 있어야 한다)", () => {
    expect(pickRichestLineup([lineup(0, 0)])).not.toBeNull()
  })

  it("ready 가 아닌 페이로드와 null 은 후보가 아니다", () => {
    expect(pickRichestLineup([null, { status: "none" } as LineupResponse])).toBeNull()
    expect(pickRichestLineup([])).toBeNull()
  })
})

describe("mergeMotmOptions", () => {
  const existing = [opt("h-a"), opt("h-b")]

  it("표가 없으면 통째로 갈아끼운다 — 선발까지 틀려 있을 수 있다", () => {
    const rebuilt = [opt("h-x"), opt("h-y"), opt("h-z", "sub")]
    expect(mergeMotmOptions(existing, rebuilt, false)).toEqual(rebuilt)
  })

  it("표가 있으면 기존 후보를 건드리지 않고 빠진 것만 덧붙인다", () => {
    const rebuilt = [opt("h-a"), opt("h-c", "sub")]
    const merged = mergeMotmOptions(existing, rebuilt, true)
    // 기존 두 개가 자리·순서 그대로 남아야 이미 던진 표가 살아남는다
    expect(merged!.slice(0, 2)).toEqual(existing)
    expect(merged!.map((o) => o.key)).toEqual(["h-a", "h-b", "h-c"])
  })

  it("표가 있는데 새 후보가 없으면 아무것도 하지 않는다", () => {
    expect(mergeMotmOptions(existing, [opt("h-a")], true)).toBeNull()
  })

  it("표가 없어도 후보가 늘지 않으면 건드리지 않는다", () => {
    expect(mergeMotmOptions(existing, [opt("h-a"), opt("h-b")], false)).toBeNull()
  })
})
