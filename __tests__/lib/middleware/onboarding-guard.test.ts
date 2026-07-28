import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * onboardingGuard — **실제 가드를 import 해서** 검증한다.
 * (기존 파일은 ONBOARDING_EXCLUDED 복사본만 검증하는 미러 테스트였다 — test-gaps.md)
 *
 * 지키는 계약:
 *   1. /onboarding·/sign-up·/api 등 제외 경로는 DB 조회 없이 통과 (무한 리다이렉트 방지)
 *   2. 완료 쿠키(positive cache)가 있으면 DB 조회 생략
 *   3. negative cache 는 없다 — 쿠키가 없으면 항상 DB 로 self-heal
 *      (2026-06-20 /↔/sign-up 무한 루프 회귀의 재발 방지선)
 *   4. 신규 유저(PGRST116)·미완료 유저 → /sign-up 리다이렉트
 *   5. 완료 유저 → 통과 + onboarding_done 쿠키 24h 캐싱
 *   6. DB 예외 → /sign-up 리다이렉트 (미완료 쪽으로 fail)
 */

const singleMock = vi.fn()
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => singleMock(),
        }),
      }),
    }),
  }),
}))

import { onboardingGuard } from "@/lib/middleware/onboarding-guard"

const authAs = (userId: string | null) => vi.fn(async () => ({ userId }))

function makeReq(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, "https://gongnori.fan"), {
    headers: cookie ? { cookie } : undefined,
  })
}

describe("onboardingGuard", () => {
  beforeEach(() => {
    singleMock.mockReset()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("제외 경로는 auth·DB 를 건드리지 않는다 — /onboarding 자기 자신 포함 (루프 방지)", async () => {
    const auth = authAs("user_1")
    for (const path of ["/onboarding", "/onboarding/step2", "/api/posts", "/sign-up", "/sign-in"]) {
      expect(await onboardingGuard(auth, makeReq(path))).toBeNull()
    }
    expect(auth).not.toHaveBeenCalled()
    expect(singleMock).not.toHaveBeenCalled()
  })

  it("비로그인 유저는 검사 대상이 아니다", async () => {
    const res = await onboardingGuard(authAs(null), makeReq("/community/football"))
    expect(res).toBeNull()
    expect(singleMock).not.toHaveBeenCalled()
  })

  it("완료 쿠키가 있으면 DB 조회 없이 통과한다 (positive cache)", async () => {
    const res = await onboardingGuard(authAs("user_1"), makeReq("/", "onboarding_done=1"))
    expect(res).toBeNull()
    expect(singleMock).not.toHaveBeenCalled()
  })

  it("과거의 incomplete 쿠키가 남아 있어도 단락하지 않고 DB 로 재확인한다 (negative cache 금지 — 루프 회귀 방지)", async () => {
    singleMock.mockResolvedValue({ data: { onboarding_completed: true }, error: null })
    const res = await onboardingGuard(
      authAs("user_1"),
      makeReq("/", "onboarding_status=incomplete")
    )
    // DB 가 완료라고 하면 통과해야 한다 — 쿠키만 보고 /sign-up 으로 보내면 무한 루프
    expect(res?.headers.get("location") ?? null).toBeNull()
    expect(singleMock).toHaveBeenCalledTimes(1)
  })

  it("신규 유저(프로필 없음, PGRST116) → /sign-up 리다이렉트", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "PGRST116" } })
    const res = await onboardingGuard(authAs("user_new"), makeReq("/community/football"))
    expect(new URL(res!.headers.get("location")!).pathname).toBe("/sign-up")
  })

  it("온보딩 미완료 유저 → /sign-up 리다이렉트", async () => {
    singleMock.mockResolvedValue({ data: { onboarding_completed: false }, error: null })
    const res = await onboardingGuard(authAs("user_1"), makeReq("/"))
    expect(new URL(res!.headers.get("location")!).pathname).toBe("/sign-up")
  })

  it("완료 유저는 통과하고 onboarding_done 쿠키가 24시간으로 캐싱된다", async () => {
    singleMock.mockResolvedValue({ data: { onboarding_completed: true }, error: null })
    const res = await onboardingGuard(authAs("user_1"), makeReq("/"))

    expect(res).not.toBeNull()
    expect(res!.headers.get("location")).toBeNull() // 리다이렉트 아님
    const cookie = res!.cookies.get("onboarding_done")
    expect(cookie?.value).toBe("1")
    expect(cookie?.maxAge).toBe(60 * 60 * 24)
    expect(cookie?.httpOnly).toBe(true)
  })

  it("DB 조회가 예외를 던지면 /sign-up 으로 보낸다 (완료로 간주하지 않음)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    singleMock.mockRejectedValue(new Error("connection refused"))
    const res = await onboardingGuard(authAs("user_1"), makeReq("/"))
    expect(new URL(res!.headers.get("location")!).pathname).toBe("/sign-up")
    errorSpy.mockRestore()
  })

  it("Supabase env 가 없으면 막지 않고 통과한다 (가용성 우선, 로그만)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    const res = await onboardingGuard(authAs("user_1"), makeReq("/"))
    expect(res).toBeNull()
    errorSpy.mockRestore()
  })
})
