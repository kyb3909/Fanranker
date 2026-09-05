import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({ lineup: vi.fn() }))
vi.mock("@/lib/match/get-lineup", () => ({ getMatchLineup: m.lineup }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ success: true }) }))
import { GET } from "@/app/api/match/lineup/route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("MATCH_LINEUP", undefined)
})
afterEach(() => vi.unstubAllEnvs())
const request = () =>
  new NextRequest(
    "http://localhost/api/match/lineup?gameId=25563aeb-2bed-4c0f-92be-14747e822c46&v=lfa"
  )
it.each([
  { status: "ready", projected: true },
  { status: "ready", projected: false },
  { status: "pending" },
])("설정 미지정이어도 LFA 조회하며 응답을 CDN에 고정하지 않는다: %j", async (payload) => {
  m.lineup.mockResolvedValue(payload)
  const response = await GET(request())
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual(payload)
  expect(m.lineup).toHaveBeenCalledOnce()
})
it("명시적 off는 공급자를 호출하지 않는다", async () => {
  vi.stubEnv("MATCH_LINEUP", "off")
  expect(await (await GET(request())).json()).toEqual({ status: "none" })
  expect(m.lineup).not.toHaveBeenCalled()
})
