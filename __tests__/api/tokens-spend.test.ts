import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema extracted from app/api/tokens/spend/route.ts
// ============================================================

const TokenSpendSchema = z.object({
  amount: z.number().int("토큰 양은 정수여야 합니다.").positive("토큰 양은 0보다 커야 합니다."),
  description: z.string().optional(),
  related_prediction_id: z.string().optional(),
  idempotency_key: z.string().uuid().optional(),
})

// ============================================================
// Idempotency duplicate detection logic
// ============================================================

interface ExistingTxn {
  id: string
}

function hasProcessedIdempotencyKey(existing: ExistingTxn | null | undefined): boolean {
  return !!existing?.id
}

describe("tokens/spend — TokenSpendSchema", () => {
  it("accepts positive integer amount", () => {
    expect(TokenSpendSchema.safeParse({ amount: 1 }).success).toBe(true)
    expect(TokenSpendSchema.safeParse({ amount: 100 }).success).toBe(true)
  })

  it("rejects zero amount", () => {
    const r = TokenSpendSchema.safeParse({ amount: 0 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("토큰 양은 0보다 커야 합니다.")
    }
  })

  it("rejects negative amount", () => {
    const r = TokenSpendSchema.safeParse({ amount: -5 })
    expect(r.success).toBe(false)
  })

  it("rejects non-integer amount", () => {
    const r = TokenSpendSchema.safeParse({ amount: 1.5 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("토큰 양은 정수여야 합니다.")
    }
  })

  it("rejects missing amount", () => {
    expect(TokenSpendSchema.safeParse({}).success).toBe(false)
  })

  it("rejects non-number amount", () => {
    expect(TokenSpendSchema.safeParse({ amount: "1" }).success).toBe(false)
    expect(TokenSpendSchema.safeParse({ amount: null }).success).toBe(false)
  })

  it("accepts optional description", () => {
    expect(TokenSpendSchema.safeParse({ amount: 10, description: "베팅" }).success).toBe(true)
  })

  it("accepts optional related_prediction_id", () => {
    expect(
      TokenSpendSchema.safeParse({ amount: 10, related_prediction_id: "pred_abc" }).success
    ).toBe(true)
  })

  it("accepts valid UUID idempotency_key", () => {
    expect(
      TokenSpendSchema.safeParse({
        amount: 10,
        idempotency_key: "123e4567-e89b-12d3-a456-426614174000",
      }).success
    ).toBe(true)
  })

  it("rejects non-UUID idempotency_key", () => {
    expect(TokenSpendSchema.safeParse({ amount: 10, idempotency_key: "not-a-uuid" }).success).toBe(
      false
    )
  })
})

describe("tokens/spend — idempotency detection", () => {
  it("returns false for null/undefined existing txn", () => {
    expect(hasProcessedIdempotencyKey(null)).toBe(false)
    expect(hasProcessedIdempotencyKey(undefined)).toBe(false)
  })

  it("returns true when existing txn has id", () => {
    expect(hasProcessedIdempotencyKey({ id: "txn_123" })).toBe(true)
  })
})
