import { afterEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/discord-notify", () => ({ notifyDiscordOps: mocks.notify }))
import { reportStatCoverageGap } from "@/lib/lfa/stat-coverage-notice"

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it("9개 중 8개가 사라진 실제 조건을 디스코드에 알리고 같은 장애는 제한한다", async () => {
  const now = Date.parse("2026-09-05T00:00:00Z")
  const clock = vi.spyOn(Date, "now").mockReturnValue(now)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  await reportStatCoverageGap("m1", 9, 1, ["Changed label"])
  await reportStatCoverageGap("m2", 9, 1, ["Changed label"])
  expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({ level: "warn", url: "/admin/operations" })
  )
  clock.mockReturnValue(now + 3600_001)
  await reportStatCoverageGap("m3", 9, 1, ["Changed label"])
  expect(mocks.notify).toHaveBeenCalledTimes(2)
})
it("정상 스탯이나 아직 빈 피드는 경보를 내지 않는다", async () => {
  await reportStatCoverageGap("m", 0, 0, [])
  await reportStatCoverageGap("m", 30, 9, ["unserved stat"])
  expect(mocks.notify).not.toHaveBeenCalled()
})
