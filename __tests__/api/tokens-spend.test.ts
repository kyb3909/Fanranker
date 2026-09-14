// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ user: vi.fn(), db: vi.fn() }))
vi.mock("@clerk/nextjs/server", () => ({ currentUser: mocks.user }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: mocks.db }))
import { POST } from "@/app/api/tokens/spend/route"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ id: "member" })
})
const request = () =>
  new NextRequest("https://audit.invalid/api/tokens/spend", {
    method: "POST",
    body: JSON.stringify({ amount: 1, idempotency_key: "11111111-1111-4111-8111-111111111111" }),
  })
describe("retired direct spending", () => {
  it("cannot deduct balance even after repeated requests", async () => {
    expect((await POST(request())).status).toBe(410)
    expect((await POST(request())).status).toBe(410)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it("preserves the anonymous authentication gate", async () => {
    mocks.user.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(401)
    expect(mocks.db).not.toHaveBeenCalled()
  })
})
