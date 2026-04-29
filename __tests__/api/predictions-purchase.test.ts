import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema + helpers extracted from app/api/predictions/purchase/route.ts
// ============================================================

const PurchaseSchema = z.object({ activity_id: z.string().min(1) })

const GOLD_COST = 500
const SELLER_SHARE = 450
const PLATFORM_FEE = 50

interface ActivityLike {
  id: string
  user_id: string
  sport: string
}

interface PredictionGameLike {
  game?: { match_time: string } | null
}

function isOwnPrediction(activityUserId: string, currentUserId: string): boolean {
  return activityUserId === currentUserId
}

function isAllGamesExpired(predictions: PredictionGameLike[] | null, now: Date): boolean {
  if (!predictions || predictions.length === 0) return false
  return predictions.every((p) => p.game && new Date(p.game.match_time) < now)
}

function buildSellerRewardContext(
  buyerId: string,
  activity: ActivityLike,
  purchaseId: string | null
) {
  return {
    sellerId: activity.user_id,
    buyerId,
    activityId: activity.id,
    purchaseId,
    amount: SELLER_SHARE,
    description: `분석글 판매 수익 (${activity.sport})`,
  }
}

// ============================================================
// Tests
// ============================================================

describe("predictions/purchase — economy invariants", () => {
  it("seller share + platform fee equals gold cost (450 + 50 = 500)", () => {
    expect(SELLER_SHARE + PLATFORM_FEE).toBe(GOLD_COST)
  })

  it("seller share is 90% of gold cost", () => {
    expect(SELLER_SHARE / GOLD_COST).toBe(0.9)
  })
})

describe("predictions/purchase — PurchaseSchema", () => {
  it("accepts valid activity_id", () => {
    expect(PurchaseSchema.safeParse({ activity_id: "act_1" }).success).toBe(true)
  })

  it("rejects empty activity_id", () => {
    expect(PurchaseSchema.safeParse({ activity_id: "" }).success).toBe(false)
  })

  it("rejects missing activity_id", () => {
    expect(PurchaseSchema.safeParse({}).success).toBe(false)
  })

  it("rejects non-string activity_id", () => {
    expect(PurchaseSchema.safeParse({ activity_id: 123 }).success).toBe(false)
  })
})

describe("predictions/purchase — isOwnPrediction", () => {
  it("flags self-purchase", () => {
    expect(isOwnPrediction("user_a", "user_a")).toBe(true)
  })

  it("allows other-user purchase", () => {
    expect(isOwnPrediction("user_a", "user_b")).toBe(false)
  })
})

describe("predictions/purchase — isAllGamesExpired", () => {
  const now = new Date("2026-04-29T12:00:00Z")

  it("returns true when all games are in the past", () => {
    const predictions = [
      { game: { match_time: "2026-04-29T10:00:00Z" } },
      { game: { match_time: "2026-04-29T11:00:00Z" } },
    ]
    expect(isAllGamesExpired(predictions, now)).toBe(true)
  })

  it("returns false when at least one game is in the future", () => {
    const predictions = [
      { game: { match_time: "2026-04-29T10:00:00Z" } },
      { game: { match_time: "2026-04-29T13:00:00Z" } },
    ]
    expect(isAllGamesExpired(predictions, now)).toBe(false)
  })

  it("returns false on null predictions", () => {
    expect(isAllGamesExpired(null, now)).toBe(false)
  })

  it("returns false on empty array", () => {
    expect(isAllGamesExpired([], now)).toBe(false)
  })

  it("returns false when a game is missing", () => {
    expect(isAllGamesExpired([{ game: null }], now)).toBe(false)
  })
})

describe("predictions/purchase — buildSellerRewardContext", () => {
  const activity: ActivityLike = { id: "act_1", user_id: "seller_a", sport: "soccer" }

  it("builds context with all fields populated", () => {
    expect(buildSellerRewardContext("buyer_b", activity, "purchase_p1")).toEqual({
      sellerId: "seller_a",
      buyerId: "buyer_b",
      activityId: "act_1",
      purchaseId: "purchase_p1",
      amount: 450,
      description: "분석글 판매 수익 (soccer)",
    })
  })

  it("preserves null purchase_id", () => {
    const ctx = buildSellerRewardContext("buyer_b", activity, null)
    expect(ctx.purchaseId).toBe(null)
  })

  it("uses sport in description", () => {
    const baseball = { ...activity, sport: "baseball" }
    expect(buildSellerRewardContext("b", baseball, null).description).toBe(
      "분석글 판매 수익 (baseball)"
    )
  })
})
