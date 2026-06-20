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

  // ──────────────────────────────────────────────────────────────
  // 회귀: 가입 직후 /↔/sign-up 무한 리다이렉트 루프 → 빈 /sign-up(null) 화면 (2026-06-20)
  //
  // 과거 미들웨어는 `onboarding_status=incomplete` 쿠키(negative cache)가 있으면
  // DB 재조회 없이 곧장 /sign-up 으로 단락했다. 온보딩 완료 직후 DB 는 완료지만
  // 이 쿠키가 (동기화 실패·path 불일치 등으로) 남으면, /sign-up 은 "이미 완료"라
  // null(빈 화면)을 그리고 다시 / 로 보내 무한 루프가 됐다.
  //   → negative cache 를 제거. 완료 쿠키(positive cache)만 통과시키고,
  //     그 외에는 항상 DB 로 판정해 self-heal 한다.
  // ──────────────────────────────────────────────────────────────
  describe("redirect-loop regression — no negative cache", () => {
    type Cookies = { onboarding_done?: string; onboarding_status?: string }

    // 미들웨어 결정 로직 미러 (onboarding-guard.ts 의 쿠키 단락 부분)
    function middlewareShortCircuit(cookies: Cookies): "pass" | "check-db" {
      if (cookies.onboarding_done) return "pass"
      // incomplete 쿠키는 더 이상 단락하지 않는다 → 항상 DB 재확인.
      return "check-db"
    }

    it("완료 쿠키(done)가 있으면 DB 조회 없이 통과한다", () => {
      expect(middlewareShortCircuit({ onboarding_done: "1" })).toBe("pass")
    })

    it("incomplete 쿠키가 남아 있어도 단락하지 않고 DB 로 재확인한다 (self-heal)", () => {
      // DB 가 완료라면 check-db 단계에서 통과 처리되므로 루프가 생기지 않는다.
      expect(middlewareShortCircuit({ onboarding_status: "incomplete" })).toBe("check-db")
    })

    it("쿠키가 전혀 없으면 DB 로 판정한다", () => {
      expect(middlewareShortCircuit({})).toBe("check-db")
    })
  })
})
