// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"
const m = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  comment: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => ({ id: "owner" }) }))
vi.mock("@/lib/points", () => ({ awardPoints: vi.fn(), POINT_VALUES: { vote_received: 1 } }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) =>
      table === "comment_votes"
        ? {
            select: () => ({ eq: () => ({ eq: () => ({ single: m.read }) }) }),
            delete: () => ({ eq: m.remove }),
            update: () => ({ eq: m.update }),
            insert: m.insert,
          }
        : { select: () => ({ eq: () => ({ single: m.comment }) }) },
  }),
}))
import { POST } from "@/app/api/comments/[id]/vote/route"
const vote = () =>
  POST(
    new NextRequest("http://localhost:3100/api/comments/test/vote", {
      method: "POST",
      body: JSON.stringify({ type: "up" }),
    }),
    { params: Promise.resolve({ id: "comment" }) }
  )
beforeEach(() => {
  vi.clearAllMocks()
  m.read.mockResolvedValue({ data: null, error: { code: "PGRST116" } })
  m.remove.mockResolvedValue({ error: null })
  m.update.mockResolvedValue({ error: null })
  m.insert.mockResolvedValue({ error: null })
  m.comment.mockResolvedValue({ data: { vote_count: 4, user_id: "owner" } })
})
describe("comment vote database errors", () => {
  it("does not interpret lookup failure as no previous vote", async () => {
    m.read.mockResolvedValue({ error: { code: "503" } })
    expect((await vote()).status).toBe(500)
    expect(m.insert).not.toHaveBeenCalled()
  })
  it("reports cancellation failure and does not return fabricated success", async () => {
    m.read.mockResolvedValue({ data: { id: "vote", vote_type: "up" } })
    m.remove.mockResolvedValue({ error: { code: "42501" } })
    expect((await vote()).status).toBe(500)
    expect(m.comment).not.toHaveBeenCalled()
  })
  it("reports direction-change failure", async () => {
    m.read.mockResolvedValue({ data: { id: "vote", vote_type: "down" } })
    m.update.mockResolvedValue({ error: { code: "42501" } })
    expect((await vote()).status).toBe(500)
  })
  it("returns the committed direction and count on success", async () => {
    const res = await vote()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      action: "created",
      voteType: "up",
      voteCount: 4,
    })
  })
})
