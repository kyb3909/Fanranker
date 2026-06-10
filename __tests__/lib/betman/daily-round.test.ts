import { describe, it, expect, vi, afterEach } from "vitest"
import {
  computeDailyId,
  getTodayDailyId,
  getDailyWindow,
  isBettingWindowOpen,
  getKSTHour,
  getGameBetDeadline,
  isGameBettable,
  formatDailyIdLabel,
  getBetOpenAt,
  getBetCloseAt,
  getNextResetTime,
  getMsUntilReset,
  getBettingWindowStatus,
} from "@/lib/betman/daily-round"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("computeDailyId", () => {
  it("assigns afternoon KST game to same day", () => {
    // 2026-02-21 15:00 KST = 2026-02-21 06:00 UTC
    expect(computeDailyId("2026-02-21T06:00:00.000Z")).toBe("2026-02-21")
  })

  it("assigns early morning KST game to previous day (before 08:00 cutoff)", () => {
    // 2026-02-21 03:00 KST = 2026-02-20 18:00 UTC → belongs to 2026-02-20 round
    expect(computeDailyId("2026-02-20T18:00:00.000Z")).toBe("2026-02-20")
  })

  it("assigns 08:00 KST game to current day", () => {
    // 2026-02-21 08:00 KST = 2026-02-20 23:00 UTC → belongs to 2026-02-21 round
    expect(computeDailyId("2026-02-20T23:00:00.000Z")).toBe("2026-02-21")
  })

  it("assigns 07:59 KST game to previous day", () => {
    // 2026-02-21 07:59 KST = 2026-02-20 22:59 UTC → belongs to 2026-02-20 round
    expect(computeDailyId("2026-02-20T22:59:00.000Z")).toBe("2026-02-20")
  })

  it("works with Date objects", () => {
    const d = new Date("2026-02-21T06:00:00.000Z") // 15:00 KST
    expect(computeDailyId(d)).toBe("2026-02-21")
  })

  it("handles midnight KST correctly", () => {
    // 2026-02-22 00:00 KST = 2026-02-21 15:00 UTC → belongs to 2026-02-21 round (before 08:00 next day)
    expect(computeDailyId("2026-02-21T15:00:00.000Z")).toBe("2026-02-21")
  })
})

describe("getTodayDailyId", () => {
  it("returns current day before 23:00 KST", () => {
    // 2026-02-22 22:00 KST = 2026-02-22 13:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T13:00:00.000Z"))

    expect(getTodayDailyId()).toBe("2026-02-22")
  })

  it("flips to next day at 23:00 KST", () => {
    // 2026-02-22 23:00 KST = 2026-02-22 14:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T14:00:00.000Z"))

    expect(getTodayDailyId()).toBe("2026-02-23")
  })
})

describe("getDailyWindow", () => {
  it("returns 08:00 KST to next day 08:00 KST", () => {
    const { start, end, dailyId } = getDailyWindow("2026-02-21")
    // start: 2026-02-21 08:00 KST = 2026-02-20 23:00 UTC
    expect(start.toISOString()).toBe("2026-02-20T23:00:00.000Z")
    // end: 2026-02-22 08:00 KST = 2026-02-21 23:00 UTC
    expect(end.toISOString()).toBe("2026-02-21T23:00:00.000Z")
    expect(dailyId).toBe("2026-02-21")
  })

  it("window is exactly 24 hours", () => {
    const { start, end } = getDailyWindow("2026-03-01")
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe("isBettingWindowOpen", () => {
  it("returns true during betting hours (10:00 KST)", () => {
    // 2026-02-22 10:00 KST = 01:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T01:00:00.000Z"))
    expect(isBettingWindowOpen()).toBe(true)
  })

  it("returns true at exactly 08:00 KST (open boundary)", () => {
    // 2026-02-22 08:00 KST = 2026-02-21 23:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-21T23:00:00.000Z"))
    expect(isBettingWindowOpen()).toBe(true)
  })

  it("returns false at 23:00 KST (close boundary)", () => {
    // 2026-02-22 23:00 KST = 14:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T14:00:00.000Z"))
    expect(isBettingWindowOpen()).toBe(false)
  })

  it("returns false in early morning (07:59 KST)", () => {
    // 2026-02-22 07:59 KST = 2026-02-21 22:59 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-21T22:59:00.000Z"))
    expect(isBettingWindowOpen()).toBe(false)
  })
})

describe("getKSTHour", () => {
  it("returns correct KST hour", () => {
    // 2026-02-22 14:00 UTC = 23:00 KST
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T14:00:00.000Z"))
    expect(getKSTHour()).toBe(23)
  })

  it("wraps around midnight", () => {
    // 2026-02-22 20:00 UTC = 05:00 KST (next day)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T20:00:00.000Z"))
    expect(getKSTHour()).toBe(5)
  })
})

describe("getGameBetDeadline", () => {
  it("returns the match time as deadline", () => {
    const matchTime = "2026-02-22T10:00:00.000Z"
    expect(getGameBetDeadline(matchTime).toISOString()).toBe(matchTime)
  })
})

describe("isGameBettable", () => {
  it("returns true for future games", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isGameBettable(future)).toBe(true)
  })

  it("returns false for past games", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(isGameBettable(past)).toBe(false)
  })
})

describe("formatDailyIdLabel", () => {
  it("formats as Korean date with weekday", () => {
    // 2026-02-22 is a Sunday
    expect(formatDailyIdLabel("2026-02-22")).toBe("2월 22일 (일)")
  })

  it("formats another day correctly", () => {
    // 2026-02-23 is a Monday
    expect(formatDailyIdLabel("2026-02-23")).toBe("2월 23일 (월)")
  })
})

describe("getBetOpenAt / getBetCloseAt", () => {
  it("getBetOpenAt returns 08:00 KST", () => {
    expect(getBetOpenAt("2026-02-22")).toBe("2026-02-22T08:00:00+09:00")
  })

  it("getBetCloseAt returns 23:00 KST", () => {
    expect(getBetCloseAt("2026-02-22")).toBe("2026-02-22T23:00:00+09:00")
  })
})

describe("getNextResetTime", () => {
  it("returns today 23:00 KST if before that time", () => {
    // Current: 2026-02-22 20:00 KST = 11:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T11:00:00.000Z"))

    const reset = getNextResetTime()
    // 2026-02-22 23:00 KST = 2026-02-22 14:00 UTC
    expect(reset.toISOString()).toBe("2026-02-22T14:00:00.000Z")
  })

  it("returns tomorrow 23:00 KST if past that time", () => {
    // Current: 2026-02-22 23:30 KST = 14:30 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T14:30:00.000Z"))

    const reset = getNextResetTime()
    // 2026-02-23 23:00 KST = 2026-02-23 14:00 UTC
    expect(reset.toISOString()).toBe("2026-02-23T14:00:00.000Z")
  })
})

describe("getBettingWindowStatus", () => {
  it("returns open status during betting hours", () => {
    // 2026-02-22 10:00 KST = 01:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T01:00:00.000Z"))
    const status = getBettingWindowStatus()
    expect(status.isOpen).toBe(true)
    expect(status.message).toBe("베팅 가능")
  })

  it("returns closed + nextOpenAt during night lock (23:30 KST)", () => {
    // 2026-02-22 23:30 KST = 14:30 UTC → next open = 2026-02-23 08:00 KST (= 02-22 23:00 UTC)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-22T14:30:00.000Z"))
    const status = getBettingWindowStatus()
    expect(status.isOpen).toBe(false)
    expect(status.nextOpenAt).toBe("2026-02-22T23:00:00.000Z")
  })

  it("returns closed + same-day nextOpenAt in early morning (07:00 KST)", () => {
    // 2026-02-22 07:00 KST = 2026-02-21 22:00 UTC → next open = 2026-02-22 08:00 KST (= 02-21 23:00 UTC)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-21T22:00:00.000Z"))
    const status = getBettingWindowStatus()
    expect(status.isOpen).toBe(false)
    expect(status.nextOpenAt).toBe("2026-02-21T23:00:00.000Z")
  })
})
