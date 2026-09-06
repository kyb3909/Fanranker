// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({}) }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/soccerway/match-mapping", () => ({ runMatchMappingShadow: mocks.run }))
import { GET } from "@/app/api/cron/match-mapping-shadow/route"
beforeEach(() => {
  vi.stubEnv("MATCH_MAPPING_SHADOW", "shadow")
  mocks.run.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
it.each([
  { errors: ["database failed"], fetchError: 0 },
  { errors: [], fetchError: 1 },
])("returns 503 for an incomplete execution: %j", async (summary) => {
  mocks.run.mockResolvedValue(summary)
  const response = await GET(new NextRequest("http://localhost/api/cron/match-mapping-shadow"))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ ...summary, success: false })
})
it("exposes budget deferral separately from execution errors", async () => {
  mocks.run.mockResolvedValue({ errors: [], fetchError: 0, deferred: 3 })
  const response = await GET(new NextRequest("http://localhost/api/cron/match-mapping-shadow"))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, deferred: 3 })
})
