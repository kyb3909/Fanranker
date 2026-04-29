import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema mirrors app/api/battles/worldcup/vote/route.ts
// ============================================================
const VoteSchema = z
  .object({
    session_id: z.string().uuid(),
    round: z.number().int().nonnegative(),
    match_index: z.number().int().nonnegative(),
    candidate_a_id: z.string().min(1),
    candidate_b_id: z.string().min(1),
    winner_id: z.string().min(1),
  })
  .refine((v) => v.winner_id === v.candidate_a_id || v.winner_id === v.candidate_b_id, {
    message: "winner_id는 candidate_a_id 또는 candidate_b_id 중 하나여야 합니다.",
    path: ["winner_id"],
  })

const validBody = {
  session_id: "00000000-0000-0000-0000-000000000000",
  round: 1,
  match_index: 0,
  candidate_a_id: "a",
  candidate_b_id: "b",
  winner_id: "a",
}

describe("worldcup vote VoteSchema", () => {
  it("accepts valid body", () => {
    expect(VoteSchema.safeParse(validBody).success).toBe(true)
  })

  it("rejects empty body", () => {
    expect(VoteSchema.safeParse({}).success).toBe(false)
  })

  it("rejects non-uuid session_id", () => {
    expect(VoteSchema.safeParse({ ...validBody, session_id: "not-uuid" }).success).toBe(false)
  })

  it("rejects round as string", () => {
    expect(VoteSchema.safeParse({ ...validBody, round: "1" }).success).toBe(false)
  })

  it("rejects negative round", () => {
    expect(VoteSchema.safeParse({ ...validBody, round: -1 }).success).toBe(false)
  })

  it("rejects fractional round", () => {
    expect(VoteSchema.safeParse({ ...validBody, round: 1.5 }).success).toBe(false)
  })

  it("rejects negative match_index", () => {
    expect(VoteSchema.safeParse({ ...validBody, match_index: -1 }).success).toBe(false)
  })

  it("rejects empty candidate_a_id", () => {
    expect(VoteSchema.safeParse({ ...validBody, candidate_a_id: "" }).success).toBe(false)
  })

  it("rejects empty winner_id", () => {
    expect(VoteSchema.safeParse({ ...validBody, winner_id: "" }).success).toBe(false)
  })

  it("rejects missing winner_id", () => {
    const partial: Partial<typeof validBody> = { ...validBody }
    delete partial.winner_id
    expect(VoteSchema.safeParse(partial).success).toBe(false)
  })

  it("accepts round=0 (zero is valid via nonnegative)", () => {
    expect(VoteSchema.safeParse({ ...validBody, round: 0 }).success).toBe(true)
  })

  it("rejects winner_id that doesn't match either candidate", () => {
    const r = VoteSchema.safeParse({ ...validBody, winner_id: "not-a-or-b" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["winner_id"])
    }
  })

  it("accepts winner_id matching candidate_b_id", () => {
    expect(VoteSchema.safeParse({ ...validBody, winner_id: "b" }).success).toBe(true)
  })
})
