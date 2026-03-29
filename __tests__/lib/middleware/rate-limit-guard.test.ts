import { describe, it, expect, vi, beforeEach } from "vitest"

// Extract and test the pure logic from rate-limit-guard.ts

const STRICT_PATHS = [
  "/api/tokens/spend",
  "/api/payments/purchase",
  "/api/predictions/settle",
  "/api/upload/image",
  "/api/posts",
  "/api/votes",
  "/api/follow",
]

function isStrictPath(pathname: string): boolean {
  return STRICT_PATHS.some((p) => pathname.startsWith(p))
}

function isDeleteProfile(pathname: string, method: string): boolean {
  return pathname === "/api/profile/me" && method === "DELETE"
}

describe("rate-limit-guard logic", () => {
  describe("isStrictPath", () => {
    it("matches exact strict paths", () => {
      expect(isStrictPath("/api/tokens/spend")).toBe(true)
      expect(isStrictPath("/api/payments/purchase")).toBe(true)
      expect(isStrictPath("/api/upload/image")).toBe(true)
      expect(isStrictPath("/api/posts")).toBe(true)
      expect(isStrictPath("/api/follow")).toBe(true)
    })

    it("matches strict path prefixes", () => {
      expect(isStrictPath("/api/posts/123")).toBe(true)
      expect(isStrictPath("/api/posts/123/vote")).toBe(true)
    })

    it("does not match non-strict paths", () => {
      expect(isStrictPath("/api/search")).toBe(false)
      expect(isStrictPath("/api/stickers")).toBe(false)
      expect(isStrictPath("/api/betman/games")).toBe(false)
      expect(isStrictPath("/api/profile/me")).toBe(false)
      expect(isStrictPath("/")).toBe(false)
    })
  })

  describe("isDeleteProfile", () => {
    it("matches DELETE /api/profile/me", () => {
      expect(isDeleteProfile("/api/profile/me", "DELETE")).toBe(true)
    })

    it("does not match GET /api/profile/me", () => {
      expect(isDeleteProfile("/api/profile/me", "GET")).toBe(false)
    })

    it("does not match DELETE on other paths", () => {
      expect(isDeleteProfile("/api/posts/123", "DELETE")).toBe(false)
    })
  })

  describe("rate limit selection", () => {
    it("strict paths get STRICT rate limit", () => {
      const isStrict =
        isStrictPath("/api/tokens/spend") || isDeleteProfile("/api/tokens/spend", "POST")
      expect(isStrict).toBe(true)
    })

    it("DELETE profile gets STRICT rate limit", () => {
      const isStrict =
        isStrictPath("/api/profile/me") || isDeleteProfile("/api/profile/me", "DELETE")
      expect(isStrict).toBe(true)
    })

    it("standard paths get STANDARD rate limit", () => {
      const isStrict = isStrictPath("/api/search") || isDeleteProfile("/api/search", "GET")
      expect(isStrict).toBe(false)
    })
  })
})
