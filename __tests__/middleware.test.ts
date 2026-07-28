import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * middleware.ts 체인 계약 — **실제 미들웨어 본문을 import 해서** 검증한다.
 *
 * 이 파일이 잠그는 것은 지금까지 주석으로만 존재하던 계약이다 (test-gaps.md P3):
 *   1. 실행 순서: rate-limit → admin → onboarding. 앞 가드가 응답을 반환하면 뒤는 실행 안 됨
 *   2. fail-closed: 가드가 예외를 던졌을 때
 *      - /admin        → / 리다이렉트 (보호 우회 차단)
 *      - /api/admin    → 503 JSON
 *      - 그 외 경로     → 통과 (가용성 우선 — 가드 오류로 사이트 전체가 죽지 않게)
 *   try/catch 한 줄만 옮겨도 조용히 fail-open 이 되는 지점이라 행동으로 고정한다.
 */

const rateLimitGuardMock = vi.fn()
const adminGuardMock = vi.fn()
const onboardingGuardMock = vi.fn()

vi.mock("@/lib/middleware/rate-limit-guard", () => ({
  rateLimitGuard: (...args: unknown[]) => rateLimitGuardMock(...args),
}))
vi.mock("@/lib/middleware/admin-guard", () => ({
  adminGuard: (...args: unknown[]) => adminGuardMock(...args),
}))
vi.mock("@/lib/middleware/onboarding-guard", () => ({
  onboardingGuard: (...args: unknown[]) => onboardingGuardMock(...args),
}))

// clerkMiddleware 는 (handler) => handler 로 벗겨서 본문만 실행한다.
// Clerk 런타임(헤더 검증·키 확인)은 이 테스트의 관심사가 아니다.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
}))

import middleware from "@/middleware"

const auth = vi.fn(async () => ({ userId: null }))

function makeReq(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://gongnori.fan"))
}

async function run(path: string) {
  // clerkMiddleware 목이 핸들러를 그대로 돌려주므로 (auth, req) 시그니처로 호출
  return (
    middleware as unknown as (a: typeof auth, r: NextRequest) => Promise<Response | undefined>
  )(auth, makeReq(path))
}

describe("middleware 체인", () => {
  beforeEach(() => {
    rateLimitGuardMock.mockReset().mockReturnValue(null)
    adminGuardMock.mockReset().mockResolvedValue(null)
    onboardingGuardMock.mockReset().mockResolvedValue(null)
  })

  it("모든 가드 통과 시 rate-limit → admin → onboarding 순서로 실행된다", async () => {
    const order: string[] = []
    rateLimitGuardMock.mockImplementation(() => (order.push("rate"), null))
    adminGuardMock.mockImplementation(async () => (order.push("admin"), null))
    onboardingGuardMock.mockImplementation(async () => (order.push("onboarding"), null))

    await run("/community/football")
    expect(order).toEqual(["rate", "admin", "onboarding"])
  })

  it("rate-limit 이 429 를 반환하면 admin·onboarding 은 실행되지 않는다", async () => {
    const limited = new Response(null, { status: 429 })
    rateLimitGuardMock.mockReturnValue(limited)

    const res = await run("/api/posts")
    expect(res).toBe(limited)
    expect(adminGuardMock).not.toHaveBeenCalled()
    expect(onboardingGuardMock).not.toHaveBeenCalled()
  })

  it("admin 가드가 리다이렉트를 반환하면 onboarding 은 실행되지 않는다", async () => {
    const redirect = new Response(null, { status: 307 })
    adminGuardMock.mockResolvedValue(redirect)

    const res = await run("/admin/users")
    expect(res).toBe(redirect)
    expect(onboardingGuardMock).not.toHaveBeenCalled()
  })

  describe("가드 예외 시 fail-closed 계약", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      adminGuardMock.mockRejectedValue(new Error("guard exploded"))
    })

    it("/admin 페이지 → / 로 리다이렉트 (예외를 틈탄 우회 차단)", async () => {
      const res = await run("/admin/settle")
      expect(res!.status).toBeGreaterThanOrEqual(300)
      expect(new URL(res!.headers.get("location")!).pathname).toBe("/")
    })

    it("/api/admin → 503 JSON (200 으로 새지 않음)", async () => {
      const res = await run("/api/admin/users")
      expect(res!.status).toBe(503)
      const body = await (res as Response).json()
      expect(body.error).toBeTruthy()
    })

    it("일반 경로 → 통과 (가드 오류로 사이트 전체가 막히지 않게)", async () => {
      const res = await run("/community/football")
      // NextResponse.next() — 리다이렉트도 에러 응답도 아니다
      expect(res!.status).toBe(200)
      expect(res!.headers.get("location")).toBeNull()
    })

    it("일반 API 경로도 통과 (fail-closed 는 admin 영역에만 적용)", async () => {
      const res = await run("/api/posts")
      expect(res!.status).toBe(200)
    })
  })
})
