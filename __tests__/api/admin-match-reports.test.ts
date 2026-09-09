// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  staff: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  refresh: vi.fn(),
  stored: vi.fn(),
  generate: vi.fn(),
}))
vi.mock("@/lib/admin/roles", () => ({ requireStaffApi: mocks.staff }))
vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApi: mocks.admin }))
vi.mock("@/lib/soccerway/report-work", () => ({
  listReportWork: mocks.list,
  resumeReportWork: mocks.resume,
}))
vi.mock("@/lib/soccerway/match-extras", () => ({
  refreshReportSource: mocks.refresh,
  hasStoredReport: mocks.stored,
  getMatchExtras: mocks.generate,
}))
import { GET, POST } from "@/app/api/admin/match-reports/route"
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/admin/match-reports", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })
  )
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ userId: "admin-user" })
  mocks.staff.mockResolvedValue({ userId: "editor-user" })
  mocks.list.mockResolvedValue([])
  mocks.stored.mockResolvedValue(false)
  mocks.resume.mockResolvedValue(undefined)
  mocks.generate.mockResolvedValue({ report: null })
})
it("rejects non-admin writes before any resume, refresh or LLM work", async () => {
  mocks.admin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))
  expect((await post({ action: "resume" })).status).toBe(403)
  expect(mocks.resume).not.toHaveBeenCalled()
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(mocks.generate).not.toHaveBeenCalled()
})
it("requires a real reason before granting budget", async () => {
  expect(
    (await post({ action: "resume", gameId: "game", version: "a".repeat(64), reason: "  " })).status
  ).toBe(400)
  expect(mocks.resume).not.toHaveBeenCalled()
})
it("audits actor/version/reason and durably queues the grant without running an LLM in the request", async () => {
  const v = "a".repeat(64)
  expect(
    (await post({ action: "resume", gameId: "game", version: v, reason: "사전 확인 완료" })).status
  ).toBe(200)
  expect(mocks.resume).toHaveBeenCalledExactlyOnceWith("game", v, "사전 확인 완료", "admin-user")
  expect(mocks.generate).not.toHaveBeenCalled()
})
it("manual refetch alone does not add budget or trigger an LLM", async () => {
  mocks.refresh.mockResolvedValue(false)
  expect((await post({ action: "refresh", gameId: "game" })).status).toBe(200)
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("game")
  expect(mocks.resume).not.toHaveBeenCalled()
  expect(mocks.generate).not.toHaveBeenCalled()
})
it("lists holds and expired reservations but excludes already stored sibling reports", async () => {
  const row = {
    game_id: "game",
    status: "dictionary",
    context: { homeTeam: "아스널", awayTeam: "첼시", paragraphs: ["private source"] },
    input_version: "version",
    missing_names: ["Karl Hein"],
    used: 0,
    budget: 6,
    unresolved: 0,
  }
  mocks.list.mockResolvedValue([row, { ...row, game_id: "done" }])
  mocks.stored.mockImplementation(async (id) => id === "done")
  const body = await (await GET()).json()
  expect(body.rows).toHaveLength(1)
  expect(body.rows[0]).toMatchObject({
    gameId: "game",
    missingNames: ["Karl Hein"],
    used: 0,
    budget: 6,
  })
  expect(body.rows[0]).not.toHaveProperty("context")
})
