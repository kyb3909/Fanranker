import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 운영 권한 경계 계약.
 *
 * editor 는 검수만 하고 돈(정산·환불·경제조정)과 권한 변경에는 닿으면 안 된다.
 * 이 경계가 무너지면 위임한 사람이 실수로 유저 잔액을 바꿀 수 있다 —
 * 그래서 "누가 통과하고 누가 막히는가"를 행동으로 고정한다.
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}))

const singleMock = vi.fn()
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

import { requireStaff, getStaffRole, requireStaffApi } from "@/lib/admin/roles"

const asUser = (userId: string | null, role?: string) => {
  authMock.mockResolvedValue({ userId })
  singleMock.mockResolvedValue({ data: role ? { role } : null, error: null })
}

describe("getStaffRole", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["admin", "admin"],
    ["editor", "editor"],
  ])("%s 는 운영 등급으로 인정된다", async (role, expected) => {
    asUser("user_1", role)
    expect(await getStaffRole()).toBe(expected)
  })

  it.each(["user", "moderator"])(
    "%s 는 운영 등급이 아니다 — moderator 는 게시판 공지 플래그일 뿐 관리 권한이 아니다",
    async (role) => {
      asUser("user_1", role)
      expect(await getStaffRole()).toBeNull()
    }
  )

  it("비로그인은 null", async () => {
    asUser(null)
    expect(await getStaffRole()).toBeNull()
  })

  it("프로필이 없어도 통과하지 않는다", async () => {
    asUser("user_ghost", undefined)
    expect(await getStaffRole()).toBeNull()
  })

  it("역할 조회가 예외를 던져도 통과하지 않는다 (fail-closed)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    authMock.mockResolvedValue({ userId: "user_1" })
    singleMock.mockRejectedValue(new Error("db down"))
    expect(await getStaffRole()).toBeNull()
    errSpy.mockRestore()
  })
})

describe("requireStaff (페이지용)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("admin·editor 는 역할을 돌려받는다", async () => {
    asUser("user_1", "editor")
    await expect(requireStaff()).resolves.toBe("editor")
  })

  it("일반 유저는 throw — 레이아웃이 catch 해서 리다이렉트한다", async () => {
    asUser("user_1", "user")
    await expect(requireStaff()).rejects.toThrow()
  })
})

describe("requireStaffApi (API용)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("editor 는 통과하고 role 을 함께 돌려준다 (화면이 등급별로 갈리므로)", async () => {
    asUser("user_1", "editor")
    const r = await requireStaffApi()
    expect(r).not.toBeInstanceOf(Response)
    expect((r as { role: string }).role).toBe("editor")
  })

  it("비로그인 → 401", async () => {
    asUser(null)
    const r = await requireStaffApi()
    expect((r as Response).status).toBe(401)
  })

  it.each(["user", "moderator"])("%s → 403", async (role) => {
    asUser("user_1", role)
    const r = await requireStaffApi()
    expect((r as Response).status).toBe(403)
  })
})
