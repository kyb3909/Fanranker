// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
import type { ReportLease } from "@/lib/soccerway/report-work"

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), insert: vi.fn(), update: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => mocks }))
import {
  holdReportDictionary,
  reserveReportCompose,
  saveReportWork,
  markReportCall,
} from "@/lib/soccerway/report-work"

const lease = () =>
  ({
    token: "token",
    work: {
      game_id: "game",
      event_id: "event",
      status: "ready",
      input_version: null,
      held_at: null,
    },
  }) as ReportLease
beforeEach(() => {
  vi.clearAllMocks()
  mocks.insert.mockResolvedValue({ error: null })
  const q: any = {
    update: mocks.update,
    eq: () => q,
    is: () => q,
    gt: () => q,
    select: () => q,
    maybeSingle: async () => ({ data: { game_id: "game", id: 1 }, error: null }),
    insert: mocks.insert,
  }
  mocks.update.mockReturnValue(q)
  mocks.from.mockReturnValue(q)
})

it("writes a dictionary ledger row with original missing names and no compose index", async () => {
  await holdReportDictionary("game", lease(), "version", ["Karl Hein"])
  expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
    game_id: "game",
    event_id: "event",
    input_version: "version",
    stage: "dictionary",
    missing_names: ["Karl Hein"],
    reason: "선수 표기 미등재: Karl Hein",
  })
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "dictionary", missing_names: ["Karl Hein"] })
  )
})
it("does not append another identical dictionary hold", async () => {
  const prior = lease()
  prior.work.status = "dictionary"
  prior.work.input_version = "version"
  await holdReportDictionary("game", prior, "version", ["Karl Hein"])
  expect(mocks.from).not.toHaveBeenCalled()
})
it("budget reservation uses one RPC; a DB error never grants a local fallback budget", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "08006" } })
  await expect(reserveReportCompose("game", "token", "version")).rejects.toThrow(
    "reserve_report_compose:08006"
  )
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reserve_report_compose", {
    p_game_id: "game",
    p_token: "token",
    p_version: "version",
  })
})
it("a lease-fenced write that matched no row fails closed", async () => {
  const q: any = {
    update: () => q,
    eq: () => q,
    gt: () => q,
    is: () => q,
    select: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
  }
  mocks.from.mockReturnValue(q)
  await expect(saveReportWork("game", "old-token", { status: "ready" })).rejects.toThrow(
    "lease-expired"
  )
  await expect(markReportCall(1, "compose_called")).rejects.toThrow("reservation-expired")
})
