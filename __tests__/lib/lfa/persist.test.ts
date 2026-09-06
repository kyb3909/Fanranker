import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LfaMatchInfo } from "@/lib/lfa/match"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), siblings: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ rpc: mocks.rpc }) }))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: mocks.siblings }))
import { writeDayMatches, writeMatchDetails } from "@/lib/lfa/persist"

const info: LfaMatchInfo = {
  matchId: "lfa-1",
  sourceUpdatedAt: 1000,
  dayUpdatedAt: 1000,
  detailsUpdatedAt: 1000,
  finished: false,
  live: true,
  minute: "60",
  homeScore: 1,
  awayScore: 0,
  htHome: 0,
  htAway: 0,
  stats: [],
  timeline: [],
}

describe("LFA atomic persistence client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mocks.siblings.mockResolvedValue(["b", "a"])
    mocks.rpc.mockResolvedValue({ data: { written: true, payload: info }, error: null })
  })
  afterEach(() => vi.restoreAllMocks())
  it("형제 전체와 원본 시각을 DB 원자 저장 함수에 전달한다", async () => {
    expect(await writeMatchDetails("b", info)).toEqual({ written: true, info })
    expect(mocks.siblings).toHaveBeenCalledWith(expect.anything(), "b", { strict: true })
    expect(mocks.rpc).toHaveBeenCalledWith("write_lfa_match_snapshot", {
      p_game_ids: ["b", "a"],
      p_match_id: "lfa-1",
      p_payload: info,
      p_updated_at: new Date(1000).toISOString(),
    })
  })
  it("저장 거절은 오류가 아니라 DB가 선택한 스냅샷으로 반환한다", async () => {
    const winner = { ...info, finished: true }
    mocks.rpc.mockResolvedValue({ data: { written: false, payload: winner }, error: null })
    expect(await writeMatchDetails("b", info, { strict: true })).toEqual({
      written: false,
      info: winner,
    })
  })
  it("PostgREST error를 크론에 전파하고 페이지에서는 fail-open한다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883" } })
    await expect(writeMatchDetails("b", info, { strict: true })).rejects.toThrow(
      "lfa-details-persist-failed"
    )
    expect(await writeMatchDetails("b", info)).toBeNull()
  })
  it("형제 조회 실패를 자기 행만 쓰는 동작으로 바꾸지 않는다", async () => {
    mocks.siblings.mockRejectedValue(new Error("sibling-list-lookup-failed"))
    await expect(writeMatchDetails("b", info, { strict: true })).rejects.toThrow(
      "sibling-list-lookup-failed"
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("원본 시각이 없는 데이터에 현재 시각을 붙여 최신으로 위장하지 않는다", async () => {
    await expect(
      writeMatchDetails("b", { ...info, sourceUpdatedAt: undefined }, { strict: true })
    ).rejects.toThrow("lfa-source-time-missing")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("날짜 저장도 같은 RPC 규칙과 오류 전파를 쓴다", async () => {
    await writeDayMatches("2026-09-07", [], 1000, { strict: true })
    expect(mocks.rpc).toHaveBeenCalledWith("write_lfa_day_snapshot", {
      p_date: "2026-09-07",
      p_payload: [],
      p_updated_at: new Date(1000).toISOString(),
    })
    mocks.rpc.mockResolvedValue({ error: { code: "57014" } })
    await expect(writeDayMatches("2026-09-07", [], 1000, { strict: true })).rejects.toThrow(
      "lfa-day-persist-failed"
    )
  })
})
