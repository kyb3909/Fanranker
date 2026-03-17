import { describe, it, expect, vi, beforeEach } from "vitest"
import { awardPoints, POINT_VALUES } from "@/lib/points"
import { type SupabaseClient } from "@supabase/supabase-js"

// -------------------------------------------------------------------
// POINT_VALUES – static constants
// -------------------------------------------------------------------

describe("POINT_VALUES", () => {
  it("has the expected point value for writing a post", () => {
    expect(POINT_VALUES.post).toBe(10)
  })

  it("has the expected point value for a comment", () => {
    expect(POINT_VALUES.comment).toBe(3)
  })

  it("has the expected point value for receiving a vote", () => {
    expect(POINT_VALUES.vote_received).toBe(2)
  })

  it("has the expected point value for joining a prediction", () => {
    expect(POINT_VALUES.prediction_join).toBe(5)
  })

  it("has the expected point value for a correct prediction (hit)", () => {
    expect(POINT_VALUES.prediction_hit).toBe(15)
  })

  it("has exactly 5 action types", () => {
    expect(Object.keys(POINT_VALUES)).toHaveLength(5)
  })
})

// -------------------------------------------------------------------
// awardPoints – RPC wrapper
// -------------------------------------------------------------------

function makeMockSupabase(rpcResult: { data: unknown; error: unknown }): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient
}

describe("awardPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls the award_points RPC with the correct parameters", async () => {
    const mockSupabase = makeMockSupabase({
      data: { success: true, amount: 10, total_points: 110 },
      error: null,
    })

    await awardPoints(mockSupabase, "user-123", "football", 10, "post", "글 작성", "post-456")

    expect(mockSupabase.rpc).toHaveBeenCalledWith("award_points", {
      p_user_id: "user-123",
      p_board_slug: "football",
      p_amount: 10,
      p_type: "post",
      p_description: "글 작성",
      p_related_id: "post-456",
    })
  })

  it("returns success: true and data fields when RPC succeeds", async () => {
    const rpcData = {
      success: true,
      amount: 10,
      total_points: 110,
      available_points: 100,
    }
    const mockSupabase = makeMockSupabase({ data: rpcData, error: null })

    const result = await awardPoints(mockSupabase, "user-123", "football", 10, "post")
    expect(result).toEqual(rpcData)
    expect(result.success).toBe(true)
  })

  it("returns success: false with reason when RPC returns an error", async () => {
    const mockSupabase = makeMockSupabase({
      data: null,
      error: { message: "insufficient balance" },
    })

    const result = await awardPoints(mockSupabase, "user-999", "baseball", -5, "deduct")
    expect(result.success).toBe(false)
    expect(result.reason).toBe("insufficient balance")
  })

  it("passes null for description when it is omitted", async () => {
    const mockSupabase = makeMockSupabase({ data: { success: true }, error: null })

    await awardPoints(mockSupabase, "user-1", "basketball", 3, "comment")

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "award_points",
      expect.objectContaining({ p_description: null })
    )
  })

  it("passes null for relatedId when it is omitted", async () => {
    const mockSupabase = makeMockSupabase({ data: { success: true }, error: null })

    await awardPoints(mockSupabase, "user-1", "basketball", 3, "comment", "댓글 작성")

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "award_points",
      expect.objectContaining({ p_related_id: null })
    )
  })

  it("passes null for both optional params when neither is provided", async () => {
    const mockSupabase = makeMockSupabase({ data: { success: true }, error: null })

    await awardPoints(mockSupabase, "user-2", "football", 2, "vote_received")

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "award_points",
      expect.objectContaining({ p_description: null, p_related_id: null })
    )
  })

  it("returns the raw data object from a successful RPC without modification", async () => {
    const rawData = { success: true, amount: 15, total_points: 250 }
    const mockSupabase = makeMockSupabase({ data: rawData, error: null })

    const result = await awardPoints(mockSupabase, "user-3", "baseball", 15, "prediction_hit")
    expect(result).toBe(rawData)
  })
})
