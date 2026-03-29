import { describe, it, expect } from "vitest"
import {
  SWR_DEDUP_SHORT,
  SWR_DEDUP_DEFAULT,
  SWR_DEDUP_LONG,
  NOTIFICATION_POLL_INTERVAL,
  BETTING_REFRESH_INTERVAL,
  CHEER_BATTLE_POLL_INTERVAL,
  CLOCK_UPDATE_INTERVAL,
  PUSH_NOTIFICATION_AUTO_CLOSE,
} from "@/lib/constants/intervals"

describe("SWR deduping intervals", () => {
  it("SWR_DEDUP_SHORT is 5 seconds", () => {
    expect(SWR_DEDUP_SHORT).toBe(5_000)
  })

  it("SWR_DEDUP_DEFAULT is 30 seconds", () => {
    expect(SWR_DEDUP_DEFAULT).toBe(30_000)
  })

  it("SWR_DEDUP_LONG is 1 minute", () => {
    expect(SWR_DEDUP_LONG).toBe(60_000)
  })

  it("maintains ordering SHORT < DEFAULT < LONG", () => {
    expect(SWR_DEDUP_SHORT).toBeLessThan(SWR_DEDUP_DEFAULT)
    expect(SWR_DEDUP_DEFAULT).toBeLessThan(SWR_DEDUP_LONG)
  })
})

describe("SWR refresh intervals", () => {
  it("NOTIFICATION_POLL_INTERVAL is 10 seconds", () => {
    expect(NOTIFICATION_POLL_INTERVAL).toBe(10_000)
  })

  it("BETTING_REFRESH_INTERVAL is 5 minutes", () => {
    expect(BETTING_REFRESH_INTERVAL).toBe(300_000)
  })

  it("notification polls faster than betting refresh", () => {
    expect(NOTIFICATION_POLL_INTERVAL).toBeLessThan(BETTING_REFRESH_INTERVAL)
  })
})

describe("setInterval / setTimeout constants", () => {
  it("CHEER_BATTLE_POLL_INTERVAL is 10 seconds", () => {
    expect(CHEER_BATTLE_POLL_INTERVAL).toBe(10_000)
  })

  it("CLOCK_UPDATE_INTERVAL is 30 seconds", () => {
    expect(CLOCK_UPDATE_INTERVAL).toBe(30_000)
  })

  it("PUSH_NOTIFICATION_AUTO_CLOSE is 5 seconds", () => {
    expect(PUSH_NOTIFICATION_AUTO_CLOSE).toBe(5_000)
  })

  it("all intervals are positive numbers", () => {
    const intervals = [
      SWR_DEDUP_SHORT,
      SWR_DEDUP_DEFAULT,
      SWR_DEDUP_LONG,
      NOTIFICATION_POLL_INTERVAL,
      BETTING_REFRESH_INTERVAL,
      CHEER_BATTLE_POLL_INTERVAL,
      CLOCK_UPDATE_INTERVAL,
      PUSH_NOTIFICATION_AUTO_CLOSE,
    ]
    for (const interval of intervals) {
      expect(interval).toBeGreaterThan(0)
      expect(Number.isInteger(interval)).toBe(true)
    }
  })
})
