import { describe, it, expect } from "vitest"
import { easeOutCubic, clamp, hexToRgba } from "@/lib/stadium/map-utils"

describe("easeOutCubic", () => {
  it("starts at 0", () => {
    expect(easeOutCubic(0)).toBe(0)
  })

  it("ends at 1", () => {
    expect(easeOutCubic(1)).toBe(1)
  })

  it("is monotonically increasing between endpoints", () => {
    const prev = easeOutCubic(0.25)
    const mid = easeOutCubic(0.5)
    const next = easeOutCubic(0.75)
    expect(prev).toBeLessThan(mid)
    expect(mid).toBeLessThan(next)
  })

  it("has decelerating slope (easing out)", () => {
    const earlyDelta = easeOutCubic(0.2) - easeOutCubic(0.1)
    const lateDelta = easeOutCubic(0.9) - easeOutCubic(0.8)
    expect(earlyDelta).toBeGreaterThan(lateDelta)
  })
})

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it("clamps to min when below", () => {
    expect(clamp(-3, 0, 10)).toBe(0)
  })

  it("clamps to max when above", () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3)
  })
})

describe("hexToRgba", () => {
  it("converts #000000 + 1 alpha", () => {
    expect(hexToRgba("#000000", 1)).toBe("rgba(0,0,0,1)")
  })

  it("converts #ffffff + 0.5 alpha", () => {
    expect(hexToRgba("#ffffff", 0.5)).toBe("rgba(255,255,255,0.5)")
  })

  it("converts mixed hex", () => {
    expect(hexToRgba("#ff8800", 0.8)).toBe("rgba(255,136,0,0.8)")
  })

  it("handles uppercase hex", () => {
    expect(hexToRgba("#AABBCC", 1)).toBe("rgba(170,187,204,1)")
  })
})
