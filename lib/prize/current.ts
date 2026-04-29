/**
 * 이달의 상품 — 운영 데이터.
 * 매월 운영자가 이 파일을 직접 수정하는 패턴 (DB/API 미연결).
 * MonthlyPrizeBanner(기존)와 MinimalPrizeCard(미니멀 톤) 둘 다 이 데이터 공유.
 */

export interface PrizeHint {
  week: number
  label: string
  emoji: string
}

export interface PrizeConfig {
  title: string
  description: string
  imageUrl: string
  month: string
  startDate: string
  hints: PrizeHint[]
}

export const CURRENT_PRIZE: PrizeConfig = {
  title: "사비 알론소 사인 유니폼",
  description: "사비 알론소 친필 사인 액자 유니폼 (2005 챔피언스리그 우승)",
  imageUrl: "/images/prizes/xabi-alonso-jersey.webp",
  month: "3월",
  startDate: "2026-03-01",
  hints: [
    { week: 1, label: "축구", emoji: "⚽" },
    { week: 2, label: "스페인", emoji: "🇪🇸" },
    { week: 3, label: "MF", emoji: "🎯" },
    { week: 4, label: "뮌헨", emoji: "🏟️" },
  ],
}

/** 시작일부터 N주 경과했으면 N개 hint 공개. 최대 4주. */
export function getRevealedWeeks(startDate: string = CURRENT_PRIZE.startDate): number {
  const start = new Date(startDate)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, Math.min(diffWeeks + 1, 4))
}
