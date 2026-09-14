// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ deleteUser: vi.fn(), read: vi.fn(), save: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { deleteUser: m.deleteUser } }),
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: vi.fn() }))
import { finishAccountDeletion } from "@/lib/account/deletion"
const db = {
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ single: m.read }) }),
    update: (value: unknown) => ({ eq: () => ({ is: () => m.save(value) }) }),
  })),
}
beforeEach(() => {
  vi.clearAllMocks()
  m.read.mockResolvedValue({
    data: { user_id: "owner", completed_at: null, attempts: 2 },
    error: null,
  })
  m.deleteUser.mockResolvedValue({})
  m.save.mockResolvedValue({ error: null })
})
const finish = () => finishAccountDeletion(db as never, "owner")
describe("durable Clerk deletion", () => {
  it("does not touch provider when no deletion was committed locally", async () => {
    m.read.mockResolvedValue({ data: null, error: { code: "missing" } })
    await expect(finish()).rejects.toThrow()
    expect(m.deleteUser).not.toHaveBeenCalled()
  })
  it("deletes the identity and acknowledges the queued request", async () => {
    expect(await finish()).toBe(true)
    expect(m.deleteUser).toHaveBeenCalledWith("owner")
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, completed_at: expect.any(String), last_error: null })
    )
  })
  it("keeps a failed provider deletion retryable", async () => {
    m.deleteUser.mockRejectedValue({ status: 503 })
    expect(await finish()).toBe(false)
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, last_error: expect.any(String) })
    )
    expect(m.save.mock.calls[0][0]).not.toHaveProperty("completed_at")
  })
  it("treats provider 404 as already deleted after a lost acknowledgement", async () => {
    m.deleteUser.mockRejectedValue({ status: 404 })
    expect(await finish()).toBe(true)
  })
  it("does not acknowledge a provider deletion when queue save failed", async () => {
    m.save.mockResolvedValue({ error: { code: "unavailable" } })
    expect(await finish()).toBe(false)
  })
  it("skips a completed request", async () => {
    m.read.mockResolvedValue({ data: { completed_at: "2026-09-14T00:00:00Z" } })
    expect(await finish()).toBe(true)
    expect(m.deleteUser).not.toHaveBeenCalled()
  })
})
