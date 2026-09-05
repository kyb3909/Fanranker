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

const m = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  byGame: vi.fn(),
  byPrediction: vi.fn(),
}))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: async () => ["market", "sibling"] }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({ select: () => ({ in: m.read }), upsert: m.upsert, update: m.update }),
  }),
}))
import { loadStoredLineup, loadStoredLfaLineup, storeLfaLineup } from "@/lib/match/lineup-store"

beforeEach(() => {
  vi.clearAllMocks()
  m.read.mockResolvedValue({ data: [], error: null })
  m.upsert.mockResolvedValue({ error: null })
  m.update.mockReturnValue({ eq: m.byGame })
  m.byGame.mockReturnValue({ eq: m.byPrediction })
  m.byPrediction.mockResolvedValue({ error: null })
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
it("예상 저장은 확정 행을 덮지 않는 조건부 쓰기를 사용한다", async () => {
  await storeLfaLineup("market", "lfa-id", { ...previewLineup, projected: true })
  expect(m.upsert).toHaveBeenCalledWith(expect.anything(), {
    onConflict: "game_id",
    ignoreDuplicates: true,
  })
  expect(m.byGame).toHaveBeenCalledWith("game_id", "market")
  expect(m.byPrediction).toHaveBeenCalledWith("payload->>projected", "true")
})
it("확정 저장은 출처와 선수 ID를 보존한다", async () => {
  await storeLfaLineup("market", "lfa-id", previewLineup)
  expect(m.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      event_id: "lfa-id",
      payload: expect.objectContaining({ source: "lfa", matchId: "lfa-id", projected: false }),
    }),
    { onConflict: "game_id" }
  )
})
it("과거 Soccerway 저장 명단도 외부 호출 없이 표시하고 출처를 위조하지 않는다", async () => {
  const archived = {
    ...previewLineup,
    projected: undefined,
    kickoff: "2026-09-05T14:00:00Z",
    fetchedAt: "2026-09-05T15:15:00Z",
  }
  m.read.mockResolvedValue({ data: [row("rLM64qM5", archived)] })
  expect(await loadStoredLineup("market")).toMatchObject({
    status: "ready",
    projected: false,
    home: archived.home,
  })
  expect((await loadStoredLineup("market"))!).not.toHaveProperty("source")
  expect(m.upsert).not.toHaveBeenCalled()
})
it("벤치가 많은 예상 명단이 확정 저장분을 밀어내지 않는다", async () => {
  m.read.mockResolvedValue({
    data: [
      row("confirmed", { ...previewLineup, home: { ...previewLineup.home, bench: [] } }),
      row("predicted", {
        ...previewLineup,
        source: "lfa",
        projected: true,
        home: { ...previewLineup.home, bench: Array(20).fill({}) },
      }),
    ],
  })
  expect(await loadStoredLineup("market")).toMatchObject({ projected: false, home: { bench: [] } })
})
it("DB 오류는 빈 결과나 저장 성공으로 숨기지 않는다", async () => {
  m.read.mockResolvedValue({ error: { code: "READ_FAILED" } })
  await expect(loadStoredLfaLineup("market")).rejects.toThrow("lineup-read:READ_FAILED")
  m.upsert.mockResolvedValue({ error: { code: "WRITE_FAILED" } })
  await expect(storeLfaLineup("market", "lfa-id", previewLineup)).rejects.toThrow(
    "lineup-store:WRITE_FAILED"
  )
})
