/**
 * PortOne payment plan definitions
 */

export const PLANS = {
  premium: {
    id: "premium",
    name: "FanRanker 프리미엄",
    orderName: "FanRanker 프리미엄 월간 구독",
    amount: 9900,
    currency: "KRW" as const,
    intervalDays: 30,
    description: "전문가 분석 열람, 프리미엄 예측 정보, 광고 없는 경험",
  },
} as const

export type PlanId = keyof typeof PLANS

/**
 * PortOne API base URL (v2)
 */
export const PORTONE_API_BASE = "https://api.portone.io"
