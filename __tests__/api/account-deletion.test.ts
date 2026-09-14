// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const m = vi.hoisted(() => ({
  user: vi.fn(),
  rpc: vi.fn(),
  finish: vi.fn(),
  read: vi.fn(),
  insert: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", () => ({ currentUser: m.user }))
vi.mock("@/lib/account/deletion", () => ({ finishAccountDeletion: m.finish }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: m.read }) }), insert: m.insert }),
  }),
}))
import { DELETE, GET, PATCH } from "@/app/api/profile/me/route"
const req = (body: unknown = { confirm: "계정삭제" }, method = "DELETE") =>
  new NextRequest("http://localhost:3100/api/profile/me", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
beforeEach(() => {
  vi.clearAllMocks()
  m.user.mockResolvedValue({ id: "owner" })
  m.rpc.mockResolvedValue({ error: null })
  m.finish.mockResolvedValue(true)
  m.read.mockResolvedValue({ data: { user_id: "owner", deleted_at: "2026-09-14" }, error: null })
})
describe("account deletion route", () => {
  it("requires authenticated ownership and explicit confirmation", async () => {
    m.user.mockResolvedValue(null)
    expect((await DELETE(req())).status).toBe(401)
    m.user.mockResolvedValue({ id: "owner" })
    expect((await DELETE(req({ confirm: "no" }))).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it("never calls Clerk deletion before the local transaction succeeds", async () => {
    m.rpc.mockResolvedValue({ error: { code: "failed" } })
    expect((await DELETE(req())).status).toBe(500)
    expect(m.finish).not.toHaveBeenCalled()
  })
  it("uses only the authenticated identity even if another ID is submitted", async () => {
    const res = await DELETE(req({ confirm: "계정삭제", user_id: "someone-else" }))
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalledWith("request_account_deletion", { p_user_id: "owner" })
    expect(res.cookies.get("onboarding_done")?.value).toBe("")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })
  it("acknowledges a durable pending request when the provider is unavailable", async () => {
    m.finish.mockResolvedValue(false)
    const res = await DELETE(req())
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ success: true, status: "pending" })
  })
  it("returns pending if the follow-up queue read temporarily throws", async () => {
    m.finish.mockRejectedValue(new Error("connection lost"))
    expect((await DELETE(req())).status).toBe(202)
  })
  it("does not expose the deleted profile or recreate it by PATCH", async () => {
    expect((await GET(new NextRequest("http://localhost:3100/api/profile/me"))).status).toBe(410)
    expect((await PATCH(req({ bio: "revive" }, "PATCH"))).status).toBe(410)
    expect(m.insert).not.toHaveBeenCalled()
  })
})
