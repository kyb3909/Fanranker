// lib/site-config.ts - 사이트 모드 분기 설정

export type SiteMode = "sports" | "culture"

export const SITE_MODE: SiteMode =
  (process.env.NEXT_PUBLIC_SITE_MODE as SiteMode) || "sports"

export const IS_SPORTS = SITE_MODE === "sports"
export const IS_CULTURE = SITE_MODE === "culture"

/** 스포츠 모드에서만 접근 가능한 라우트 */
export const SPORTS_ONLY_ROUTES = [
  "/prediction",
  "/my-predictions",
  "/admin/matches",
  "/admin/settlements",
  "/admin/tokens",
  "/api/cron/betman-sync",
  "/api/cron/daily-token-reset",
  "/api/betman",
  "/api/predictions",
  "/api/tokens",
]

/** 컬쳐 모드에서만 접근 가능한 라우트 */
export const CULTURE_ONLY_ROUTES = [
  "/art",
  "/api/art",
  "/api/commissions",
  "/api/upload/art",
]

/** 주어진 경로가 현재 사이트 모드에서 허용되는지 확인 */
export function isRouteAllowed(pathname: string): boolean {
  if (IS_SPORTS) {
    return !CULTURE_ONLY_ROUTES.some((route) => pathname.startsWith(route))
  }
  if (IS_CULTURE) {
    return !SPORTS_ONLY_ROUTES.some((route) => pathname.startsWith(route))
  }
  return true
}

/** 사이트별 메타 정보 */
export const SITE_META = {
  sports: {
    name: "FanRanker",
    title: "FanRanker - 스포츠 예측 커뮤니티",
    description: "스포츠 승부예측과 커뮤니티를 한곳에서. FanRanker",
    keywords: [
      "스포츠 예측", "승부예측", "프로토", "축구", "야구",
      "농구", "배구", "e스포츠", "커뮤니티",
    ],
  },
  culture: {
    name: "FanRanker Culture",
    title: "FanRanker Culture - 아트 & 크리에이터 커뮤니티",
    description: "아트 갤러리, 커미션, 크리에이터를 위한 커뮤니티. FanRanker Culture",
    keywords: [
      "아트", "일러스트", "커미션", "크리에이터", "갤러리",
      "팬아트", "디지털아트", "커뮤니티",
    ],
  },
} as const
