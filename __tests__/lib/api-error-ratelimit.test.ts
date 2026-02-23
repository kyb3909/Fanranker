import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

// Mock rate-limit module
const mockRateLimit = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: any[]) => mockRateLimit(...args),
  RATE_LIMITS: {
    STRICT: { limit: 10, windowMs: 60_000 },
    STANDARD: { limit: 60, windowMs: 60_000 },
    LENIENT: { limit: 120, windowMs: 60_000 },
  },
}))

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    })),
  },
}))

import { checkRateLimit } from "@/lib/api-error"

describe("checkRateLimit", () => {
  const makeRequest = (ip = "1.2.3.4") => ({
    headers: {
      get: (name: string) => (name === "x-forwarded-for" ? ip : null),
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when under limit", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 59 })
    const result = checkRateLimit(makeRequest())
    expect(result).toBeNull()
  })

  it("returns 429 response when limit exceeded", () => {
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 })
    const result = checkRateLimit(makeRequest()) as any
    expect(result).not.toBeNull()
    expect(result.status).toBe(429)
    expect(result.body.error).toContain("요청이 너무 많습니다")
  })

  it("uses STANDARD preset by default", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 59 })
    checkRateLimit(makeRequest())
    expect(mockRateLimit).toHaveBeenCalledWith("1.2.3.4", 60, 60_000)
  })

  it("uses STRICT preset when specified", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 })
    checkRateLimit(makeRequest(), "STRICT")
    expect(mockRateLimit).toHaveBeenCalledWith("1.2.3.4", 10, 60_000)
  })

  it("uses LENIENT preset when specified", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 119 })
    checkRateLimit(makeRequest(), "LENIENT")
    expect(mockRateLimit).toHaveBeenCalledWith("1.2.3.4", 120, 60_000)
  })

  it("extracts first IP from x-forwarded-for with multiple IPs", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 59 })
    const req = {
      headers: {
        get: (name: string) => (name === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2, 10.0.0.3" : null),
      },
    }
    checkRateLimit(req)
    expect(mockRateLimit).toHaveBeenCalledWith("10.0.0.1", 60, 60_000)
  })

  it("uses 'unknown' when no IP header present", () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 59 })
    const req = { headers: { get: () => null } }
    checkRateLimit(req)
    expect(mockRateLimit).toHaveBeenCalledWith("unknown", 60, 60_000)
  })

  it("includes rate limit headers in 429 response", () => {
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 })
    const result = checkRateLimit(makeRequest(), "STRICT") as any
    expect(result.headers["Retry-After"]).toBe("60")
    expect(result.headers["X-RateLimit-Limit"]).toBe("10")
    expect(result.headers["X-RateLimit-Remaining"]).toBe("0")
  })
})
