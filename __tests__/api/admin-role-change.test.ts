import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema extracted from app/api/admin/users/[userId]/role/route.ts
// ============================================================

const RoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
})

// ============================================================
// Self-demotion guard (보안-8)
// ============================================================

/**
 * admin이 자기 자신의 role을 admin 외로 바꾸는 것을 차단.
 * 다른 admin이 수행하도록 강제하여 패널 접근권 상실 footgun 방지.
 */
function isSelfDemotion(adminId: string, targetUserId: string, newRole: string): boolean {
  return adminId === targetUserId && newRole !== "admin"
}

describe("admin/users/[userId]/role — RoleSchema", () => {
  it("accepts all three valid roles", () => {
    expect(RoleSchema.safeParse({ role: "user" }).success).toBe(true)
    expect(RoleSchema.safeParse({ role: "moderator" }).success).toBe(true)
    expect(RoleSchema.safeParse({ role: "admin" }).success).toBe(true)
  })

  it("rejects unknown role", () => {
    expect(RoleSchema.safeParse({ role: "superadmin" }).success).toBe(false)
    expect(RoleSchema.safeParse({ role: "guest" }).success).toBe(false)
  })

  it("rejects empty or missing role", () => {
    expect(RoleSchema.safeParse({}).success).toBe(false)
    expect(RoleSchema.safeParse({ role: "" }).success).toBe(false)
  })

  it("rejects non-string role", () => {
    expect(RoleSchema.safeParse({ role: 1 }).success).toBe(false)
    expect(RoleSchema.safeParse({ role: null }).success).toBe(false)
  })
})

describe("admin/users/[userId]/role — isSelfDemotion", () => {
  const ADMIN = "user_admin123"
  const OTHER = "user_other456"

  it("blocks admin demoting self to user", () => {
    expect(isSelfDemotion(ADMIN, ADMIN, "user")).toBe(true)
  })

  it("blocks admin demoting self to moderator", () => {
    expect(isSelfDemotion(ADMIN, ADMIN, "moderator")).toBe(true)
  })

  it("allows admin changing own role to admin (no-op)", () => {
    expect(isSelfDemotion(ADMIN, ADMIN, "admin")).toBe(false)
  })

  it("allows admin changing another user's role to anything", () => {
    expect(isSelfDemotion(ADMIN, OTHER, "user")).toBe(false)
    expect(isSelfDemotion(ADMIN, OTHER, "moderator")).toBe(false)
    expect(isSelfDemotion(ADMIN, OTHER, "admin")).toBe(false)
  })
})
