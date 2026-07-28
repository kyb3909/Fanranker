import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `/admin` 전체의 role 게이트 테스트.
 *
 * 왜 이 테스트가 필요한가
 * - `app/admin/layout.tsx` 의 `requireAdmin()` 이 어드민 페이지 전체의 **유일한** role
 *   게이트다. 미들웨어(`lib/middleware/admin-guard.ts`)는 로그인 여부만 본다.
 * - 그런데 이 함수에 테스트가 하나도 없었다 (docs/refactor/risk-map.md #5).
 *
 * 이 파일은 **실제 모듈을 import 한다.** 저장소의 기존 API 테스트 다수는 프로덕션 코드를
 * import 하지 않고 로직 복사본을 검증해서, 원본이 바뀌어도 초록불이 유지된다
 * (docs/refactor/test-gaps.md). 그 패턴을 따르지 않는다.
 *
 * 검증 대상은 **행동**이다: "권한 없으면 throw 한다", "어떤 실패든 fail-closed 다".
 * 구현 세부(쿼리 형태 등)에 묶지 않아 리팩토링해도 살아남아야 한다.
 */

const authMock = vi.fn()
const singleMock = vi.fn()

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => singleMock(),
        }),
      }),
    }),
  }),
}))

const loadModule = async () => await import("@/lib/supabase/admin")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  // console.error 로 테스트 출력이 더러워지는 것만 막는다 (동작은 그대로)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("requireAdmin — /admin 의 유일한 role 게이트", () => {
  it("role 이 admin 이면 통과한다", async () => {
    authMock.mockResolvedValue({ userId: "user_admin" })
    singleMock.mockResolvedValue({ data: { role: "admin" }, error: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).resolves.toBeUndefined()
  })

  it("일반 유저(role=user)는 거부한다", async () => {
    authMock.mockResolvedValue({ userId: "user_normal" })
    singleMock.mockResolvedValue({ data: { role: "user" }, error: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("role 이 null 이면 거부한다", async () => {
    authMock.mockResolvedValue({ userId: "user_norole" })
    singleMock.mockResolvedValue({ data: { role: null }, error: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("비로그인이면 거부한다 (DB 조회 없이)", async () => {
    authMock.mockResolvedValue({ userId: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
    expect(singleMock).not.toHaveBeenCalled()
  })

  /* ── fail-closed 계약 ──
   * 여기가 이 파일의 핵심이다. 인증 게이트는 "에러 나면 통과"가 되는 순간 무의미해진다.
   * 아래 세 경우 모두 거부해야 한다. */

  it("프로필 조회가 에러를 반환하면 거부한다", async () => {
    authMock.mockResolvedValue({ userId: "user_x" })
    singleMock.mockResolvedValue({ data: null, error: { message: "PGRST116" } })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("프로필이 없으면 거부한다", async () => {
    authMock.mockResolvedValue({ userId: "user_ghost" })
    singleMock.mockResolvedValue({ data: null, error: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("DB 가 throw 해도 통과시키지 않는다 (fail-closed)", async () => {
    authMock.mockResolvedValue({ userId: "user_x" })
    singleMock.mockRejectedValue(new Error("connection timeout"))

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("Clerk auth() 가 throw 해도 통과시키지 않는다 (fail-closed)", async () => {
    authMock.mockRejectedValue(new Error("clerk unavailable"))

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("role 이 'Admin'/'ADMIN' 이어도 통과시키지 않는다 (정확히 'admin' 만)", async () => {
    authMock.mockResolvedValue({ userId: "user_case" })
    singleMock.mockResolvedValue({ data: { role: "Admin" }, error: null })

    const { requireAdmin } = await loadModule()
    await expect(requireAdmin()).rejects.toThrow()
  })
})
