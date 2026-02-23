import { describe, it, expect, vi } from "vitest"

// Mock Sentry before importing api-error
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"
import * as Sentry from "@sentry/nextjs"

describe("apiError", () => {
  it("returns JSON response with error message and status", () => {
    const result = apiError("Something failed", 500) as unknown as { body: { error: string }; status: number }
    expect(result.body).toEqual({ error: "Something failed" })
    expect(result.status).toBe(500)
  })

  it("captures exception to Sentry when error is provided", () => {
    const err = new Error("test error")
    apiError("Failed", 500, err)
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { apiMessage: "Failed", status: 500 },
    })
  })

  it("does not capture to Sentry when no error provided", () => {
    vi.mocked(Sentry.captureException).mockClear()
    apiError("Not found", 404)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})

describe("apiBadRequest", () => {
  it("returns 400 status", () => {
    const result = apiBadRequest("Invalid input") as unknown as { body: { error: string }; status: number }
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: "Invalid input" })
  })
})

describe("apiUnauthorized", () => {
  it("returns 401 with default message", () => {
    const result = apiUnauthorized() as unknown as { body: { error: string }; status: number }
    expect(result.status).toBe(401)
    expect(result.body).toEqual({ error: "로그인이 필요합니다." })
  })

  it("returns 401 with custom message", () => {
    const result = apiUnauthorized("Custom auth error") as unknown as { body: { error: string }; status: number }
    expect(result.body).toEqual({ error: "Custom auth error" })
  })
})
