import { describe, it, expect } from "vitest"
import { PLANS, PORTONE_API_BASE } from "@/lib/portone/constants"
import type { PlanId } from "@/lib/portone/constants"

describe("PLANS", () => {
  it("has a premium plan", () => {
    expect(PLANS.premium).toBeDefined()
  })

  it("premium plan has correct id", () => {
    expect(PLANS.premium.id).toBe("premium")
  })

  it("premium plan name is FanRanker premium", () => {
    expect(PLANS.premium.name).toBe("FanRanker 프리미엄")
  })

  it("premium plan order name describes monthly subscription", () => {
    expect(PLANS.premium.orderName).toBe("FanRanker 프리미엄 월간 구독")
  })

  it("premium plan costs 9900 KRW", () => {
    expect(PLANS.premium.amount).toBe(9900)
    expect(PLANS.premium.currency).toBe("KRW")
  })

  it("premium plan interval is 30 days", () => {
    expect(PLANS.premium.intervalDays).toBe(30)
  })

  it("premium plan has a description", () => {
    expect(PLANS.premium.description).toBeTruthy()
    expect(typeof PLANS.premium.description).toBe("string")
  })

  it("amount is a positive integer (no decimals for KRW)", () => {
    expect(PLANS.premium.amount).toBeGreaterThan(0)
    expect(Number.isInteger(PLANS.premium.amount)).toBe(true)
  })
})

describe("PlanId type", () => {
  it("premium is a valid PlanId", () => {
    const planId: PlanId = "premium"
    expect(planId).toBe("premium")
    expect(PLANS[planId]).toBeDefined()
  })
})

describe("PORTONE_API_BASE", () => {
  it("is the PortOne v2 API URL", () => {
    expect(PORTONE_API_BASE).toBe("https://api.portone.io")
  })

  it("uses HTTPS", () => {
    expect(PORTONE_API_BASE).toMatch(/^https:\/\//)
  })
})
