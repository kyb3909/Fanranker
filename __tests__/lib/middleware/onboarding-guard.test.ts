import { describe, it, expect } from "vitest"

// Extract and test the pure logic from onboarding-guard.ts

const ONBOARDING_EXCLUDED = [
  "/onboarding",
  "/api/",
  "/sign-up",
  "/sign-in",
  "/sso-callback",
  "/terms",
  "/privacy",
  "/content-policy",
  "/_next/",
  "/favicon.ico",
  "/design-demo",
]

function isOnboardingExcluded(pathname: string): boolean {
  return ONBOARDING_EXCLUDED.some((p) => pathname.startsWith(p))
}

describe("onboarding-guard logic", () => {
  describe("isOnboardingExcluded", () => {
    it("excludes onboarding page itself", () => {
      expect(isOnboardingExcluded("/onboarding")).toBe(true)
      expect(isOnboardingExcluded("/onboarding/step2")).toBe(true)
    })

    it("excludes all API routes", () => {
      expect(isOnboardingExcluded("/api/posts")).toBe(true)
      expect(isOnboardingExcluded("/api/profile/me")).toBe(true)
    })

    it("excludes auth pages", () => {
      expect(isOnboardingExcluded("/sign-up")).toBe(true)
      expect(isOnboardingExcluded("/sign-in")).toBe(true)
      expect(isOnboardingExcluded("/sso-callback")).toBe(true)
    })

    it("excludes legal pages", () => {
      expect(isOnboardingExcluded("/terms")).toBe(true)
      expect(isOnboardingExcluded("/privacy")).toBe(true)
      expect(isOnboardingExcluded("/content-policy")).toBe(true)
    })

    it("excludes Next.js internals", () => {
      expect(isOnboardingExcluded("/_next/static/chunks/main.js")).toBe(true)
      expect(isOnboardingExcluded("/favicon.ico")).toBe(true)
    })

    it("does NOT exclude regular pages (should check onboarding)", () => {
      expect(isOnboardingExcluded("/")).toBe(false)
      expect(isOnboardingExcluded("/community/football")).toBe(false)
      expect(isOnboardingExcluded("/post/some-id")).toBe(false)
      expect(isOnboardingExcluded("/settings")).toBe(false)
      expect(isOnboardingExcluded("/shop")).toBe(false)
      expect(isOnboardingExcluded("/live")).toBe(false)
      expect(isOnboardingExcluded("/games")).toBe(false)
    })
  })
})
