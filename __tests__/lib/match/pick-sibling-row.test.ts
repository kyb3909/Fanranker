import { describe, expect, it } from "vitest"
import { pickDetailsRow, pickLineupRow } from "@/lib/match/pick-sibling-row"

/**
 * 형제 행 중 하나 고르기 (2026-09-02). 7일 실측: 52경기 중 40경기가 상세 2~6행,
 * 8경기는 경기 중 상태로 굳은 행이 FT 행 옆에 남아 있었다 — 그 8경기가 이 규칙의 이유다.
 */

describe("pickDetailsRow — finished 우선, 다음 최신", () => {
  it("첼시 4-3 실사고 재현: 경기 중(1-0, finished=false) 행이 3개 있어도 FT 행을 고른다", () => {
    const rows = [
      { game_id: "a", finished: false, updated_at: "2026-08-30T12:44:00Z", score: "1-0" },
      { game_id: "b", finished: false, updated_at: "2026-08-30T12:44:00Z", score: "1-0" },
      { game_id: "c", finished: true, updated_at: "2026-08-30T16:15:00Z", score: "4-3" },
      { game_id: "d", finished: false, updated_at: "2026-08-30T12:44:00Z", score: "1-0" },
    ]
    expect(pickDetailsRow(rows)?.game_id).toBe("c")
  })

  it("finished 끼리면 가장 최근 갱신", () => {
    const rows = [
      { id: 1, finished: true, updated_at: "2026-08-30T15:00:00Z" },
      { id: 2, finished: true, updated_at: "2026-08-30T16:00:00Z" },
    ]
    expect(pickDetailsRow(rows)?.id).toBe(2)
  })

  it("전부 비-finished 면 최신 — 라이브 중엔 그게 가장 덜 낡은 값이다", () => {
    const rows = [
      { id: 1, finished: false, updated_at: "2026-08-30T13:00:00Z" },
      { id: 2, finished: false, updated_at: "2026-08-30T13:05:00Z" },
    ]
    expect(pickDetailsRow(rows)?.id).toBe(2)
  })

  it("빈 배열 → null", () => {
    expect(pickDetailsRow([])).toBeNull()
  })

  it("updated_at 이 깨져 있어도 죽지 않는다", () => {
    expect(pickDetailsRow([{ id: 1, finished: true, updated_at: "garbage" }])?.id).toBe(1)
  })
})

describe("pickLineupRow — ready 만, 벤치 많은 쪽, 다음 최신", () => {
  const ready = (id: string, bench: number, updated_at = "2026-08-30T12:00:00Z") => ({
    id,
    updated_at,
    payload: {
      status: "ready",
      home: { bench: Array(bench).fill({}) },
      away: { bench: [] },
    },
  })

  it("MoTM 교체 후보 누락 사고의 교훈 — 벤치가 있는 행이 벤치 0 행을 이긴다", () => {
    expect(pickLineupRow([ready("thin", 0), ready("full", 9)])?.id).toBe("full")
  })

  it("ready 가 아니면 후보가 아니다", () => {
    const rows = [{ id: "p", updated_at: "2026-08-30T12:00:00Z", payload: { status: "pending" } }]
    expect(pickLineupRow(rows)).toBeNull()
  })

  it("벤치 수가 같으면 최신", () => {
    expect(
      pickLineupRow([
        ready("old", 7, "2026-08-30T12:00:00Z"),
        ready("new", 7, "2026-08-30T13:00:00Z"),
      ])?.id
    ).toBe("new")
  })

  it("payload 가 없는 행은 건너뛴다", () => {
    expect(pickLineupRow([{ id: "x", payload: null }, ready("ok", 3)])?.id).toBe("ok")
  })
})
