import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { formatRelativeTime, formatKoreanTime } from "@/lib/utils/date"

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-24T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns '방금 전' for less than 1 minute ago", () => {
    const now = new Date()
    expect(formatRelativeTime(now)).toBe("방금 전")
    expect(formatRelativeTime(new Date(now.getTime() - 30 * 1000))).toBe("방금 전")
  })

  it("returns minutes for 1-59 minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinAgo)).toBe("5분 전")

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
    expect(formatRelativeTime(thirtyMinAgo)).toBe("30분 전")
  })

  it("returns hours for 1-23 hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    expect(formatRelativeTime(twoHoursAgo)).toBe("2시간 전")
  })

  it("returns days for 1-6 days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(threeDaysAgo)).toBe("3일 전")
  })

  it("returns formatted date for 7+ days ago", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const result = formatRelativeTime(twoWeeksAgo)
    // Should be a locale-formatted date string, not "14일 전"
    expect(result).not.toContain("일 전")
  })
})

describe("formatKoreanTime", () => {
  it("returns '-' for null input", () => {
    expect(formatKoreanTime(null)).toBe("-")
  })

  it("formats ISO string to Korean locale", () => {
    const result = formatKoreanTime("2026-02-24T14:30:00Z")
    // Should contain some date/time components
    expect(result).toBeTruthy()
    expect(result).not.toBe("-")
  })
})
