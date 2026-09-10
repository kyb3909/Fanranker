import { describe, expect, it, vi } from "vitest"
import { auditDb } from "../../helpers/audit-db"
const identity = vi.hoisted(() =>
  vi.fn(async (_db, id) => ({
    gameIds: [id, "lfa-alias"],
    lfaMatchId: null as string | null,
    pollKeys: ["lfa_saved"],
  }))
)
vi.mock("@/lib/match/sibling-ids", () => ({ getMatchIdentity: identity }))
import { missingMatchFindingResolved } from "@/lib/ops/resolve-match-findings"

describe("expired missing-match findings", () => {
  it("keeps old missing threads open after their schedule disappears", async () => {
    const { db } = auditDb()
    expect(
      await missingMatchFindingResolved(db as any, "match_thread_missing", { game_id: "old" })
    ).toBe(false)
  })
  it("resolves only after the real linked thread exists", async () => {
    const { db } = auditDb({
      posts: [{ id: "thread", match_game_id: "lfa-alias", deleted_at: null }],
    })
    expect(
      await missingMatchFindingResolved(db as any, "match_thread_missing", { game_id: "old" })
    ).toBe(true)
  })
  it("does not treat deleted threads as repaired", async () => {
    const { db } = auditDb({
      posts: [{ id: "thread", match_game_id: "old", deleted_at: "2026-09-09T00:00:00Z" }],
    })
    expect(
      await missingMatchFindingResolved(db as any, "match_thread_missing", { game_id: "old" })
    ).toBe(false)
  })
  it("keeps legacy aggregate findings without IDs open", async () => {
    const { db } = auditDb()
    expect(
      await missingMatchFindingResolved(db as any, "motm_poll_missing", { missing: ["old match"] })
    ).toBe(false)
  })
  it("rechecks MOTM through both saved aliases and poll keys", async () => {
    const { db } = auditDb({ polls: [{ id: "poll", match_key: "lfa_saved", kind: "motm" }] })
    expect(
      await missingMatchFindingResolved(db as any, "motm_poll_missing", {
        matches: [{ gameIds: ["old"] }],
      })
    ).toBe(true)
  })
  it("propagates failed rechecks instead of falsely resolving", async () => {
    const { db, state } = auditDb()
    state.fail = "posts"
    await expect(
      missingMatchFindingResolved(db as any, "match_thread_missing", { game_id: "old" })
    ).rejects.toThrow("DB unavailable")
  })
})
