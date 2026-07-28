import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { adminGuard } from "@/lib/middleware/admin-guard"

/**
 * adminGuard — **실제 가드를 import 해서** 검증한다.
 *
 * 지키는 계약:
 *   1. /admin 페이지는 비로그인 시 /sign-up 리다이렉트 (쿼리 포함 redirect_url 보존)
 *   2. redirect_url 은 항상 내부 /admin 경로 (open redirect 방어)
 *   3. /api/admin 은 통과 — 각 API 가 requireAdminApi 로 자체 검증 (위임 계약)
 *   4. 일반 경로는 auth() 호출조차 없이 통과 (비용 계약)
 */

const authAs = (userId: string | null) => vi.fn(async () => ({ userId }))

function makeReq(url: string): NextRequest {
  return new NextRequest(new URL(url, "https://gongnori.fan"))
}

describe("adminGuard", () => {
  let auth: ReturnType<typeof authAs>

  beforeEach(() => {
    auth = authAs(null)
  })

  it("일반 경로는 auth() 를 호출하지 않고 통과한다", async () => {
    const res = await adminGuard(auth, makeReq("/community/football"))
    expect(res).toBeNull()
    expect(auth).not.toHaveBeenCalled()
  })

  it("/api/admin 은 리다이렉트하지 않는다 — 각 API 의 자체 검증에 위임", async () => {
    const res = await adminGuard(auth, makeReq("/api/admin/users"))
    expect(res).toBeNull()
  })

  it("비로그인 + /admin → /sign-up 리다이렉트", async () => {
    const res = await adminGuard(auth, makeReq("/admin"))
    expect(res).not.toBeNull()
    const location = new URL(res!.headers.get("location")!)
    expect(location.pathname).toBe("/sign-up")
  })

  it("리다이렉트 시 경로+쿼리가 redirect_url 로 보존된다", async () => {
    const res = await adminGuard(auth, makeReq("/admin/users?page=2&q=kim"))
    const location = new URL(res!.headers.get("location")!)
    expect(location.searchParams.get("redirect_url")).toBe("/admin/users?page=2&q=kim")
  })

  it("redirect_url 은 항상 /admin 으로 시작한다 (open redirect 방어)", async () => {
    // 매처를 통과하는 모든 admin 하위 경로에서 성립해야 하는 속성
    for (const path of ["/admin", "/admin/settle", "/admin/users/abc?x=//evil.com"]) {
      const res = await adminGuard(auth, makeReq(path))
      const location = new URL(res!.headers.get("location")!)
      expect(location.searchParams.get("redirect_url")!.startsWith("/admin")).toBe(true)
    }
  })

  it("로그인 유저는 통과한다 (역할 검증은 페이지/API 몫)", async () => {
    const res = await adminGuard(authAs("user_123"), makeReq("/admin/users"))
    expect(res).toBeNull()
  })
})
