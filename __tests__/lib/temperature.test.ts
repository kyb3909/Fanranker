import { describe, it, expect } from "vitest"
import {
  getTemperatureColor,
  getTemperatureStyle,
  computeTemperature,
  getDisplayTemperature,
} from "@/lib/temperature"

describe("getTemperatureColor", () => {
  it("returns blue for low temperatures", () => {
    expect(getTemperatureColor(0)).toBe("text-blue-500")
    expect(getTemperatureColor(5)).toBe("text-blue-500")
  })

  it("returns cyan for 10-19", () => {
    expect(getTemperatureColor(10)).toBe("text-cyan-500")
    expect(getTemperatureColor(19)).toBe("text-cyan-500")
  })

  it("returns yellow for 20-39", () => {
    expect(getTemperatureColor(20)).toBe("text-yellow-500")
    expect(getTemperatureColor(39)).toBe("text-yellow-500")
  })

  it("returns amber for 40-59", () => {
    expect(getTemperatureColor(40)).toBe("text-amber-500")
  })

  it("returns orange for 60-79", () => {
    expect(getTemperatureColor(60)).toBe("text-orange-500")
  })

  it("returns red for 80+", () => {
    expect(getTemperatureColor(80)).toBe("text-primary")
    expect(getTemperatureColor(100)).toBe("text-primary")
  })
})

describe("getTemperatureStyle", () => {
  it("returns an HSL color string", () => {
    const style = getTemperatureStyle(50)
    expect(style.color).toMatch(/^hsl\(/)
  })

  it("clamps to 0-100 range", () => {
    const styleLow = getTemperatureStyle(-10)
    const styleHigh = getTemperatureStyle(150)
    // At 0: hue=220, at 100: hue=0
    expect(styleLow.color).toContain("220")
    expect(styleHigh.color).toMatch(/^hsl\(0,/)
  })
})

describe("computeTemperature", () => {
  const basePost = {
    vote_count: 0,
    comment_count: 0,
    view_count_unique: 0,
    created_at: new Date().toISOString(),
  }

  it("gives new posts a boost", () => {
    const now = new Date()
    const temp = computeTemperature({ ...basePost, created_at: now.toISOString() }, now)
    // New post boost = 8 points
    expect(temp).toBeGreaterThanOrEqual(8)
  })

  it("returns 0 for old posts with no engagement", () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 30)
    const temp = computeTemperature({ ...basePost, created_at: oldDate.toISOString() }, new Date())
    expect(temp).toBe(0)
  })

  it("increases with votes and comments", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours ago
    const noEngagement = computeTemperature({ ...basePost, created_at: created.toISOString() }, now)
    const withEngagement = computeTemperature(
      { ...basePost, vote_count: 10, comment_count: 5, created_at: created.toISOString() },
      now
    )
    expect(withEngagement).toBeGreaterThan(noEngagement)
  })

  it("caps at 100", () => {
    const now = new Date()
    const temp = computeTemperature(
      {
        vote_count: 10000,
        comment_count: 5000,
        view_count_unique: 50000,
        created_at: now.toISOString(),
      },
      now
    )
    expect(temp).toBeLessThanOrEqual(100)
  })

  it("never returns negative", () => {
    const now = new Date()
    const temp = computeTemperature(
      { vote_count: -5, comment_count: -3, created_at: now.toISOString() },
      now
    )
    expect(temp).toBeGreaterThanOrEqual(0)
  })
})

describe("getDisplayTemperature", () => {
  it("strips boost from new posts (< 1 hour)", () => {
    const now = new Date()
    // 새 글의 온도가 8(부스트)이면 표시 온도는 0
    const display = getDisplayTemperature(8, now.toISOString(), now)
    expect(display).toBe(0)
  })

  it("strips partial boost from 1-4 hour old posts", () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    // 2시간 된 글: boost = 8 * (4-2)/3 ≈ 5.33
    const display = getDisplayTemperature(10, twoHoursAgo.toISOString(), now)
    expect(display).toBeGreaterThan(0)
    expect(display).toBeLessThan(10)
  })

  it("returns temperature as-is for old posts (> 4 hours)", () => {
    const now = new Date()
    const oldDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    // 24시간 된 글: boost = 0이므로 온도 그대로
    const display = getDisplayTemperature(25, oldDate.toISOString(), now)
    expect(display).toBe(25)
  })

  it("never returns negative", () => {
    const now = new Date()
    const display = getDisplayTemperature(3, now.toISOString(), now)
    expect(display).toBeGreaterThanOrEqual(0)
  })
})
