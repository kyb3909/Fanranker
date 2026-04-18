import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema extracted from app/api/payments/purchase/route.ts
// ============================================================

const PurchaseSchema = z.object({
  prediction_id: z.string().min(1, "예측 ID가 필요합니다."),
})

// ============================================================
// Premium/price validation logic
// ============================================================

interface PredictionForPurchase {
  id: string
  user_id: string
  is_premium: boolean | null
  price: number | null
}

type ValidationResult = { valid: true } | { valid: false; error: string; status: number }

function validatePredictionPurchasable(prediction: PredictionForPurchase): ValidationResult {
  if (!prediction.is_premium) {
    return { valid: false, error: "이 예측은 유료 콘텐츠가 아닙니다.", status: 400 }
  }
  if (!prediction.price || prediction.price <= 0) {
    return { valid: false, error: "유효하지 않은 가격입니다.", status: 400 }
  }
  return { valid: true }
}

describe("payments/purchase — PurchaseSchema", () => {
  it("accepts valid prediction_id", () => {
    expect(PurchaseSchema.safeParse({ prediction_id: "pred_abc" }).success).toBe(true)
  })

  it("rejects empty prediction_id", () => {
    const r = PurchaseSchema.safeParse({ prediction_id: "" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("예측 ID가 필요합니다.")
    }
  })

  it("rejects missing prediction_id", () => {
    expect(PurchaseSchema.safeParse({}).success).toBe(false)
  })

  it("rejects non-string prediction_id", () => {
    expect(PurchaseSchema.safeParse({ prediction_id: 123 }).success).toBe(false)
    expect(PurchaseSchema.safeParse({ prediction_id: null }).success).toBe(false)
  })
})

describe("payments/purchase — validatePredictionPurchasable", () => {
  const base = { id: "pred_1", user_id: "user_a" }

  it("accepts premium prediction with positive price", () => {
    expect(validatePredictionPurchasable({ ...base, is_premium: true, price: 100 })).toEqual({
      valid: true,
    })
  })

  it("rejects non-premium prediction", () => {
    const r = validatePredictionPurchasable({ ...base, is_premium: false, price: 100 })
    expect(r).toEqual({
      valid: false,
      error: "이 예측은 유료 콘텐츠가 아닙니다.",
      status: 400,
    })
  })

  it("rejects premium with null price", () => {
    const r = validatePredictionPurchasable({ ...base, is_premium: true, price: null })
    expect(r.valid).toBe(false)
    if (!r.valid) {
      expect(r.error).toBe("유효하지 않은 가격입니다.")
    }
  })

  it("rejects premium with zero price", () => {
    const r = validatePredictionPurchasable({ ...base, is_premium: true, price: 0 })
    expect(r.valid).toBe(false)
  })

  it("rejects premium with negative price", () => {
    const r = validatePredictionPurchasable({ ...base, is_premium: true, price: -50 })
    expect(r.valid).toBe(false)
  })

  it("rejects null is_premium", () => {
    const r = validatePredictionPurchasable({ ...base, is_premium: null, price: 100 })
    expect(r.valid).toBe(false)
  })
})
