import { beforeEach, expect, it, vi } from "vitest"
import { previewLineup as visualLineup } from "@/app/dev/match-preview/fixtures"
import type { LineupResponse } from "@/lib/match/lineup-types"

const withIds = (side: typeof visualLineup.home) => ({
  ...side,
  starters: side.starters.map((p) => ({ ...p, roman: p.label, id: `player-${p.number}` })),
  bench: side.bench.map((p) => ({ ...p, roman: p.label, id: `player-${p.number}` })),
})
const previewLineup = {
  ...visualLineup,
  home: withIds(visualLineup.home),
  away: withIds(visualLineup.away),
}

const m = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: async () => ["market", "sibling"] }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({ select: () => ({ in: m.read }), upsert: m.upsert }),
  }),
}))
import { loadStoredLfaLineup, storeLfaLineup } from "@/lib/match/lineup-store"

beforeEach(() => {
  vi.clearAllMocks()
  m.read.mockResolvedValue({ data: [], error: null })
  m.upsert.mockResolvedValue({ error: null })
})
const row = (
  eventId: string,
  payload: Extract<LineupResponse, { status: "ready" }> = { ...previewLineup, source: "lfa" }
) => ({
  game_id: "sibling",
  event_id: eventId,
  payload,
  updated_at: new Date().toISOString(),
})
it("Soccerway/출처 불명/예상 저장분을 확정 명단으로 재사용하지 않는다", async () => {
  m.read.mockResolvedValue({
    data: [
      row("legacy", previewLineup),
      row("lfa-id", { ...previewLineup, source: "lfa", projected: true }),
    ],
  })
  expect(await loadStoredLfaLineup("market")).toBeNull()
})
it("기존 LFA 저장분은 검증된 match ID가 일치할 때만 허용한다", async () => {
  m.read.mockResolvedValue({ data: [row("lfa-id", previewLineup)] })
  expect(await loadStoredLfaLineup("market", "different")).toBeNull()
  expect(await loadStoredLfaLineup("market", "lfa-id")).toMatchObject({
    status: "ready",
    projected: false,
  })
  expect(m.read).toHaveBeenCalledWith("game_id", ["market", "sibling"])
})
it("LFA 표시가 있어도 요청한 match ID가 다르면 거절한다", async () => {
  m.read.mockResolvedValue({ data: [row("wrong-id")] })
  expect(await loadStoredLfaLineup("market", "right-id")).toBeNull()
})
it("명시적 확정만 출처와 선수 ID를 보존해 저장한다", async () => {
  await storeLfaLineup("market", "lfa-id", { ...previewLineup, projected: true })
  expect(m.upsert).not.toHaveBeenCalled()
  await storeLfaLineup("market", "lfa-id", previewLineup)
  expect(m.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      event_id: "lfa-id",
      payload: expect.objectContaining({ source: "lfa", matchId: "lfa-id", projected: false }),
    }),
    { onConflict: "game_id" }
  )
})
it("DB 오류는 빈 결과나 저장 성공으로 숨기지 않는다", async () => {
  m.read.mockResolvedValue({ error: { code: "READ_FAILED" } })
  await expect(loadStoredLfaLineup("market")).rejects.toThrow("lineup-read:READ_FAILED")
  m.upsert.mockResolvedValue({ error: { code: "WRITE_FAILED" } })
  await expect(storeLfaLineup("market", "lfa-id", previewLineup)).rejects.toThrow(
    "lineup-store:WRITE_FAILED"
  )
})
