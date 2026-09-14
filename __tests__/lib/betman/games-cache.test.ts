// @vitest-environment node
import { describe, it, expect } from "vitest"
import { gamesCacheControl } from "@/lib/betman/games-cache"
import { formatMatchTime } from "@/types/betting"
describe("prediction response boundaries", () => {
  const now = Date.parse("2026-09-13T22:59:40+09:00")
  it("never puts member predictions in shared cache", () =>
    expect(gamesCacheControl("member", [], now, now)).toBe("private, no-store"))
  it("expires at the daily rollover without stale reuse", () =>
    expect(gamesCacheControl(null, [], now, now)).toBe(
      "public, max-age=0, s-maxage=20, must-revalidate"
    ))
  it("expires at an earlier kickoff", () =>
    expect(
      gamesCacheControl(null, [{ match_time: "2026-09-13T22:59:45+09:00" }], now, now)
    ).toContain("s-maxage=5,"))
  it("cannot cache a response whose deadline passed during assembly", () =>
    expect(
      gamesCacheControl(null, [{ match_time: "2026-09-13T22:59:45+09:00" }], now, now + 6000)
    ).toBe("no-store"))
  it("formats kickoff identically in UTC and KST server environments", () => {
    const before = process.env.TZ
    try {
      process.env.TZ = "UTC"
      const utc = formatMatchTime("2026-09-13T15:30:00Z")
      process.env.TZ = "Asia/Seoul"
      expect(formatMatchTime("2026-09-13T15:30:00Z")).toBe(utc)
      expect(utc).toContain("09.14")
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })
})
