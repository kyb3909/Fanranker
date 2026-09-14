// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const m = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn() }))
vi.mock("@supabase/supabase-js", () => ({ createClient: m.create }))
import { accountGuard } from "@/lib/middleware/account-guard"
const auth = vi.fn()
const request = (path = "/api/posts", method = "POST") =>
  new NextRequest("http://localhost:3100" + path, { method })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated")
  auth.mockResolvedValue({ userId: "owner" })
  m.create.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ single: m.read }) }) }) })
  m.read.mockResolvedValue({ data: { deleted_at: null }, error: null })
})
describe("departed account boundary", () => {
  it("blocks an old session from authenticated APIs", async () => {
    m.read.mockResolvedValue({ data: { deleted_at: "2026-09-14" } })
    expect((await accountGuard(auth, request()))?.status).toBe(410)
  })
  it("redirects browser sessions to sign out", async () => {
    m.read.mockResolvedValue({ data: { deleted_at: "2026-09-14" } })
    expect(
      (await accountGuard(auth, request("/profile/owner", "GET")))?.headers.get("location")
    ).toBe("http://localhost:3100/account-deleted")
  })
  it("permits deletion retries and the sign-out page without a profile lookup", async () => {
    expect(await accountGuard(auth, request("/api/profile/me", "DELETE"))).toBeNull()
    expect(await accountGuard(auth, request("/account-deleted", "GET"))).toBeNull()
    expect(m.read).not.toHaveBeenCalled()
  })
  it("does not make a database request for guests", async () => {
    auth.mockResolvedValue({ userId: null })
    expect(await accountGuard(auth, request())).toBeNull()
    expect(m.create).not.toHaveBeenCalled()
  })
  it("permits a newly registered account with no profile", async () => {
    m.read.mockResolvedValue({ data: null, error: { code: "PGRST116" } })
    expect(await accountGuard(auth, request())).toBeNull()
  })
  it("fails closed if account status cannot be read", async () => {
    m.read.mockResolvedValue({ data: null, error: { code: "503" } })
    expect((await accountGuard(auth, request()))?.status).toBe(503)
  })
  it("does not let an auth exception reach a fail-open middleware catch", async () => {
    auth.mockRejectedValue(new Error("auth unavailable"))
    expect((await accountGuard(auth, request()))?.status).toBe(503)
  })
  it("rechecks the profile after deletion instead of reusing a positive cache", async () => {
    expect(await accountGuard(auth, request())).toBeNull()
    m.read.mockResolvedValue({ data: { deleted_at: "2026-09-14" } })
    expect((await accountGuard(auth, request()))?.status).toBe(410)
    expect(m.read).toHaveBeenCalledTimes(2)
  })
})
