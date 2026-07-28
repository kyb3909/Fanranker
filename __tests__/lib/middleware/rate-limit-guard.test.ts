import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * rateLimitGuard — **실제 가드를 import 해서** 검증한다.
 * (기존 파일은 STRICT_PATHS 복사본만 검증하는 미러 테스트였다 — test-gaps.md)
 *
 * lib/rate-limit 의 rateLimit 만 목으로 바꿔 관측한다:
 * 어떤 키·어떤 한도로 호출하는가(선택 계약)와 초과 시 응답 형태(429 계약).
 * 카운터 자체는 __tests__/lib/rate-limit.test.ts 가 검증한다.
 */

const rateLimitMock = vi.fn()
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>()
  return {
    ...actual,
    rateLimit: (...args: Parameters<typeof actual.rateLimit>) => rateLimitMock(...args),
  }
})

import { rateLimitGuard } from "@/lib/middleware/rate-limit-guard"
import { RATE_LIMITS } from "@/lib/rate-limit"

function makeReq(
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(new URL(path, "https://gongnori.fan"), {
    method: opts.method ?? "GET",
    headers: opts.headers,
  })
}

describe("rateLimitGuard", () => {
  beforeEach(() => {
    rateLimitMock.mockReset()
    rateLimitMock.mockReturnValue({ success: true, remaining: 5 })
  })

  it("API 가 아닌 경로는 카운터를 건드리지 않고 통과한다", () => {
    expect(rateLimitGuard(makeReq("/community/football"))).toBeNull()
    expect(rateLimitMock).not.toHaveBeenCalled()
  })

  it("돈 라우트(/api/tokens/spend)는 STRICT 한도를 쓴다", () => {
    rateLimitGuard(makeReq("/api/tokens/spend", { method: "POST" }))
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.any(String),
      RATE_LIMITS.STRICT.limit,
      RATE_LIMITS.STRICT.windowMs
    )
  })

  it("STRICT 는 prefix 매칭이다 — /api/posts/123/vote 도 STRICT", () => {
    rateLimitGuard(makeReq("/api/posts/123/vote", { method: "POST" }))
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.any(String),
      RATE_LIMITS.STRICT.limit,
      expect.any(Number)
    )
  })

  it("계정 삭제(DELETE /api/profile/me)는 STRICT, 조회(GET)는 STANDARD", () => {
    rateLimitGuard(makeReq("/api/profile/me", { method: "DELETE" }))
    expect(rateLimitMock).toHaveBeenLastCalledWith(
      expect.any(String),
      RATE_LIMITS.STRICT.limit,
      expect.any(Number)
    )

    rateLimitGuard(makeReq("/api/profile/me", { method: "GET" }))
    expect(rateLimitMock).toHaveBeenLastCalledWith(
      expect.any(String),
      RATE_LIMITS.STANDARD.limit,
      expect.any(Number)
    )
  })

  it("일반 API 는 STANDARD 한도를 쓴다", () => {
    rateLimitGuard(makeReq("/api/search"))
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.any(String),
      RATE_LIMITS.STANDARD.limit,
      RATE_LIMITS.STANDARD.windowMs
    )
  })

  it("키는 `IP:경로` — x-forwarded-for 첫 항목을 trim 해서 쓴다", () => {
    rateLimitGuard(
      makeReq("/api/search", { headers: { "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" } })
    )
    expect(rateLimitMock).toHaveBeenCalledWith(
      "1.2.3.4:/api/search",
      expect.any(Number),
      expect.any(Number)
    )
  })

  it("x-forwarded-for 가 없으면 x-real-ip, 둘 다 없으면 unknown", () => {
    rateLimitGuard(makeReq("/api/search", { headers: { "x-real-ip": "5.6.7.8" } }))
    expect(rateLimitMock).toHaveBeenLastCalledWith(
      "5.6.7.8:/api/search",
      expect.any(Number),
      expect.any(Number)
    )

    rateLimitGuard(makeReq("/api/search"))
    expect(rateLimitMock).toHaveBeenLastCalledWith(
      "unknown:/api/search",
      expect.any(Number),
      expect.any(Number)
    )
  })

  it("한도 초과 시 429 + Retry-After 헤더 + 한국어 안내를 반환한다", async () => {
    rateLimitMock.mockReturnValue({ success: false, remaining: 0 })
    const res = rateLimitGuard(makeReq("/api/tokens/spend", { method: "POST" }))

    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get("Retry-After")).toBe("60")
    expect(res!.headers.get("X-RateLimit-Limit")).toBe(String(RATE_LIMITS.STRICT.limit))
    expect(res!.headers.get("X-RateLimit-Remaining")).toBe("0")
    const body = await res!.json()
    expect(body.error).toContain("요청이 너무 많습니다")
  })

  it("통과 시 null 을 반환한다 (다음 가드로 진행)", () => {
    expect(rateLimitGuard(makeReq("/api/search"))).toBeNull()
  })
})
