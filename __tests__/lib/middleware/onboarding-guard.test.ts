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
  // 회귀: 가입 완료 후 /↔/sign-up 무한 리다이렉트 루프 (2026-06-20)
  //
  // 미들웨어는 `onboarding_status=incomplete` 쿠키가 있으면 DB 재조회 없이
  // 곧장 /sign-up 으로 단락한다. 완료 시 이 쿠키를 비워주지 않으면 DB 는
  // 완료인데 미들웨어는 미완료로 알아 영구 루프가 된다.
  //   → 완료 처리(PATCH /api/profile/me)가 incomplete 쿠키를 삭제하고
  //     done 쿠키를 굽도록 syncOnboardingCookies 로 수정.
  // ──────────────────────────────────────────────────────────────
  describe("redirect-loop regression — cookie short-circuit", () => {
    type Cookies = { onboarding_done?: string; onboarding_status?: string }

    // 미들웨어 결정 로직 미러 (onboarding-guard.ts:35-42 의 쿠키 단락 부분)
    function middlewareShortCircuit(cookies: Cookies): "pass" | "redirect" | "check-db" {
      if (cookies.onboarding_done) return "pass"
      if (cookies.onboarding_status === "incomplete") return "redirect"
      return "check-db"
    }

    // 완료 처리(PATCH 응답)의 쿠키 동기화 미러 (route.ts syncOnboardingCookies)
    function applyCompletion(cookies: Cookies): Cookies {
      const next = { ...cookies }
      delete next.onboarding_status // maxAge:0 → 삭제
      next.onboarding_done = "1"
      return next
    }

    it("신규 유저는 incomplete 쿠키로 /sign-up 단락된다", () => {
      expect(middlewareShortCircuit({ onboarding_status: "incomplete" })).toBe("redirect")
    })

    it("완료 후에는 incomplete 쿠키가 사라지고 done 쿠키로 통과한다 (루프 없음)", () => {
      // 신규 유저 진입 시 미들웨어가 구운 상태
      const afterEntry: Cookies = { onboarding_status: "incomplete" }
      // 가입 완료 → 쿠키 동기화
      const afterComplete = applyCompletion(afterEntry)
      // 완료 후 / 로 이동 → 미들웨어는 더 이상 /sign-up 으로 보내지 않아야 함
      expect(afterComplete.onboarding_status).toBeUndefined()
      expect(afterComplete.onboarding_done).toBe("1")
      expect(middlewareShortCircuit(afterComplete)).toBe("pass")
    })

    it("완료 동기화가 없으면(버그 상태) incomplete 쿠키가 남아 루프가 재현된다", () => {
      // 회귀 가드: 동기화를 빼면 redirect 로 되돌아간다는 것을 명시
      const buggy: Cookies = { onboarding_status: "incomplete" } // applyCompletion 미적용
      expect(middlewareShortCircuit(buggy)).toBe("redirect")
    })
  })
})
