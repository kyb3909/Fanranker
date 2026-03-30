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
    expect(styleLow.color).toContain("220")
    expect(styleHigh.color).toMatch(/^hsl\(0,/)
  })
})

describe("computeTemperature V2", () => {
  const basePost = {
    vote_count: 0,
    comment_count: 0,
    view_count: 0,
    created_at: new Date().toISOString(),
    last_comment_at: null as string | null,
  }

  it("gives new posts a small boost (3 points)", () => {
    const now = new Date()
    const temp = computeTemperature({ ...basePost, created_at: now.toISOString() }, now)
    expect(temp).toBeGreaterThanOrEqual(3)
    expect(temp).toBeLessThanOrEqual(4)
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

  it("applies comment recency bonus", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 4 * 60 * 60 * 1000) // 4h ago
    const recentComment = new Date(now.getTime() - 30 * 60 * 1000).toISOString() // 30min ago
    const oldComment = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString() // 12h ago

    const withRecent = computeTemperature(
      {
        ...basePost,
        vote_count: 10,
        comment_count: 5,
        created_at: created.toISOString(),
        last_comment_at: recentComment,
      },
      now
    )
    const withOld = computeTemperature(
      {
        ...basePost,
        vote_count: 10,
        comment_count: 5,
        created_at: created.toISOString(),
        last_comment_at: oldComment,
      },
      now
    )
    expect(withRecent).toBeGreaterThan(withOld)
  })

  it("penalizes downvoted posts", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const upvoted = computeTemperature(
      { ...basePost, vote_count: 5, comment_count: 1, created_at: created.toISOString() },
      now
    )
    const downvoted = computeTemperature(
      { ...basePost, vote_count: -5, comment_count: 1, created_at: created.toISOString() },
      now
    )
    expect(downvoted).toBeLessThan(upvoted)
  })

  it("heavily downvoted posts reach 0", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const temp = computeTemperature(
      { ...basePost, vote_count: -20, comment_count: 0, created_at: created.toISOString() },
      now
    )
    expect(temp).toBe(0)
  })

  it("caps at 100", () => {
    const now = new Date()
    const temp = computeTemperature(
      {
        vote_count: 10000,
        comment_count: 5000,
        view_count: 50000,
        created_at: now.toISOString(),
        last_comment_at: now.toISOString(),
      },
      now
    )
    expect(temp).toBeLessThanOrEqual(100)
  })

  it("never returns negative", () => {
    const now = new Date()
    const temp = computeTemperature(
      { vote_count: -50, comment_count: 0, created_at: now.toISOString(), last_comment_at: null },
      now
    )
    expect(temp).toBeGreaterThanOrEqual(0)
  })

  // DAU 1000 시뮬레이션: 평균 글 @2h → 25~40°
  it("average post at 2h ≈ 30-40°", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const lastComment = new Date(now.getTime() - 1.5 * 60 * 60 * 1000)
    const temp = computeTemperature(
      {
        vote_count: 5,
        comment_count: 2,
        view_count: 30,
        created_at: created.toISOString(),
        last_comment_at: lastComment.toISOString(),
      },
      now
    )
    expect(temp).toBeGreaterThanOrEqual(25)
    expect(temp).toBeLessThanOrEqual(45)
  })

  // DAU 1000 시뮬레이션: 인기 글 @4h → 50~70°
  it("popular post at 4h ≈ 50-70°", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const lastComment = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const temp = computeTemperature(
      {
        vote_count: 20,
        comment_count: 10,
        view_count: 150,
        created_at: created.toISOString(),
        last_comment_at: lastComment.toISOString(),
      },
      now
    )
    expect(temp).toBeGreaterThanOrEqual(45)
    expect(temp).toBeLessThanOrEqual(75)
  })

  // 24시간 지난 평균 글 → 10~20°
  it("average post at 24h ≈ 10-20°", () => {
    const now = new Date()
    const created = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const temp = computeTemperature(
      {
        vote_count: 5,
        comment_count: 2,
        view_count: 30,
        created_at: created.toISOString(),
        last_comment_at: null,
      },
      now
    )
    expect(temp).toBeGreaterThanOrEqual(8)
    expect(temp).toBeLessThanOrEqual(22)
  })
})

describe("getDisplayTemperature V2", () => {
  it("strips boost from new posts (< 30min)", () => {
    const now = new Date()
    // 새 글의 온도가 3(부스트)이면 표시 온도는 0
    const display = getDisplayTemperature(3, now.toISOString(), now)
    expect(display).toBe(0)
  })

  it("strips partial boost from 30min-2h old posts", () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    // 1시간 된 글: boost = 3 * (2-1)/1.5 = 2.0
    const display = getDisplayTemperature(10, oneHourAgo.toISOString(), now)
    expect(display).toBeGreaterThan(0)
    expect(display).toBeLessThan(10)
  })

  it("returns temperature as-is for old posts (> 2 hours)", () => {
    const now = new Date()
    const oldDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const display = getDisplayTemperature(25, oldDate.toISOString(), now)
    expect(display).toBe(25)
  })

  it("never returns negative", () => {
    const now = new Date()
    const display = getDisplayTemperature(1, now.toISOString(), now)
    expect(display).toBeGreaterThanOrEqual(0)
  })
})
