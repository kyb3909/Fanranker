import { describe, it, expect, beforeEach, vi } from "vitest"

// We need to reset the module between tests to clear the in-memory store
let rateLimit: typeof import("@/lib/rate-limit").rateLimit
let RATE_LIMITS: typeof import("@/lib/rate-limit").RATE_LIMITS

beforeEach(async () => {
  vi.resetModules()
  const mod = await import("@/lib/rate-limit")
  rateLimit = mod.rateLimit
  RATE_LIMITS = mod.RATE_LIMITS
})

describe("rateLimit", () => {
  it("allows requests within limit", () => {
    const result = rateLimit("test-ip", 5, 60_000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it("decrements remaining count on each call", () => {
    rateLimit("ip-1", 5, 60_000)
    rateLimit("ip-1", 5, 60_000)
    const result = rateLimit("ip-1", 5, 60_000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it("blocks when limit is exceeded", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit("ip-blocked", 3, 60_000)
    }
    const result = rateLimit("ip-blocked", 3, 60_000)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("tracks different keys independently", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit("ip-a", 3, 60_000)
    }
    const resultA = rateLimit("ip-a", 3, 60_000)
    const resultB = rateLimit("ip-b", 3, 60_000)
    expect(resultA.success).toBe(false)
    expect(resultB.success).toBe(true)
  })

  it("resets after window expires", () => {
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now)

    for (let i = 0; i < 3; i++) {
      rateLimit("ip-expire", 3, 1000)
    }
    expect(rateLimit("ip-expire", 3, 1000).success).toBe(false)

    // Advance past the window
    vi.spyOn(Date, "now").mockReturnValue(now + 1001)
    const result = rateLimit("ip-expire", 3, 1000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)

    vi.restoreAllMocks()
  })
})

describe("RATE_LIMITS presets", () => {
  it("defines STRICT, STANDARD, LENIENT presets", () => {
    expect(RATE_LIMITS.STRICT).toEqual({ limit: 10, windowMs: 60_000 })
    expect(RATE_LIMITS.STANDARD).toEqual({ limit: 60, windowMs: 60_000 })
    expect(RATE_LIMITS.LENIENT).toEqual({ limit: 120, windowMs: 60_000 })
  })

  it("STRICT is most restrictive", () => {
    expect(RATE_LIMITS.STRICT.limit).toBeLessThan(RATE_LIMITS.STANDARD.limit)
    expect(RATE_LIMITS.STANDARD.limit).toBeLessThan(RATE_LIMITS.LENIENT.limit)
  })
})
