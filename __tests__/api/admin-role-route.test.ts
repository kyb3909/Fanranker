// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  writeAuditLog: vi.fn(),
  captureException: vi.fn(),
}))

// The route, response helpers, role schema, target selection, self-demotion
// guard, and audit payload are real. Auth/DB/audit transport is isolated.
vi.mock("@/lib/admin/roles", () => ({
  ADMIN_ROLE: "admin",
  requireRoleApi: () => {
    throw new Error("Unexpected unmocked authentication IO")
  },
}))
vi.mock("@/lib/admin/require-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/require-admin-api")>()),
  requireAdminApi: mocks.requireAdminApi,
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => {
    throw new Error("Unexpected unmocked database IO")
  },
}))
vi.mock("@/lib/admin/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/audit")>()),
  writeAuditLog: mocks.writeAuditLog,
}))
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }))

import { PATCH } from "@/app/api/admin/users/[userId]/role/route"

const ADMIN_ID = "user_admin_fixture"
const TARGET_ID = "user_target_fixture"
const NOW = new Date("2026-09-12T00:00:00.000Z")

function request(body: unknown, targetId = TARGET_ID) {
  return new NextRequest(`https://audit.invalid/api/admin/users/${targetId}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.0.2.10, 198.51.100.20",
    },
    body: JSON.stringify(body),
  })
}

function patch(body: unknown, targetId = TARGET_ID) {
  return PATCH(request(body, targetId), { params: Promise.resolve({ userId: targetId }) })
}

function expectNoMutation() {
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.eq).not.toHaveBeenCalled()
  expect(mocks.writeAuditLog).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.requireAdminApi.mockResolvedValue({
    userId: ADMIN_ID,
    supabase: { from: mocks.from },
  })
  mocks.from.mockReturnValue({ update: mocks.update })
  mocks.update.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockResolvedValue({ error: null })
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PATCH /api/admin/users/[userId]/role", () => {
  it.each(["user", "editor"])("returns the %s guard's 403 without a mutation", async () => {
    const forbidden = NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    mocks.requireAdminApi.mockResolvedValue(forbidden)
    const res = await patch({ role: "admin" })

    expect(res).toBe(forbidden)
    expect(res.status).toBe(403)
    expect(mocks.requireAdminApi).toHaveBeenCalledExactlyOnceWith()
    expectNoMutation()
  })

  it("returns an anonymous 401 before reading an invalid request body", async () => {
    const unauthorized = NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    mocks.requireAdminApi.mockResolvedValue(unauthorized)
    const req = new NextRequest("https://audit.invalid/api/admin/users/target/role", {
      method: "PATCH",
      body: "invalid-json",
    })
    const res = await PATCH(req, { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res).toBe(unauthorized)
    expectNoMutation()
  })

  it.each(["user", "editor", "moderator"])(
    "rejects an admin's self-demotion to %s",
    async (role) => {
      const res = await patch({ role }, ADMIN_ID)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("자기 자신의 admin 권한")
      expectNoMutation()
    }
  )

  it.each(["user", "editor", "moderator", "admin"])(
    "updates another user's role to %s and records the matching audit",
    async (role) => {
      // The target must come from the route and the actor from authentication;
      // extra body identifiers/protected profile fields must not replace them.
      const res = await patch({ role, user_id: ADMIN_ID, adminUserId: TARGET_ID, is_expert: true })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
      expect(mocks.requireAdminApi).toHaveBeenCalledExactlyOnceWith()
      expect(mocks.from).toHaveBeenCalledExactlyOnceWith("profiles")
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ role, updated_at: NOW.toISOString() })
      expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("user_id", TARGET_ID)
      expect(mocks.writeAuditLog).toHaveBeenCalledExactlyOnceWith({
        adminUserId: ADMIN_ID,
        action: "change_role",
        targetType: "user",
        targetId: TARGET_ID,
        details: { role },
        ipAddress: "192.0.2.10",
      })
      expect(mocks.eq.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.writeAuditLog.mock.invocationCallOrder[0]
      )
    }
  )

  it("allows an admin to retain their own admin role", async () => {
    const res = await patch({ role: "admin" }, ADMIN_ID)
    expect(res.status).toBe(200)
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("user_id", ADMIN_ID)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        targetId: ADMIN_ID,
        details: { role: "admin" },
      })
    )
  })

  it.each([{}, { role: "superadmin" }, { role: null }])(
    "rejects an invalid role payload %j",
    async (body) => {
      const res = await patch(body)
      expect(res.status).toBe(400)
      expectNoMutation()
    }
  )

  it("returns a database failure instead of reporting or auditing success", async () => {
    const error = { code: "42501", message: "permission denied for table profiles" }
    mocks.eq.mockResolvedValue({ error })
    const res = await patch({ role: "editor" })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: error.message })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it("returns a thrown DB transport failure without a success audit", async () => {
    const error = new Error("database unavailable")
    mocks.eq.mockRejectedValue(error)
    const res = await patch({ role: "admin" })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "서버 오류" })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.captureException).toHaveBeenCalledWith(error, expect.anything())
  })
})
