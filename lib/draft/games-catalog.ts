/**
 * 드래프트 게임 카탈로그.
 *
 * `/games/draft` 진입 화면 카드 그리드에서 사용. 활성 게임만 실제로 라우팅
 * 가능하며 (`/games/draft/{slug}`), 비활성 게임은 "준비 중" 으로 노출.
 *
 * Phase 1 (현재): EPL 만 실제 게임 화면 존재. 나머지는 카드만 표시.
 * Phase 2+: arsenal, slamdunk, 3kingdoms 등 실제 게임 화면 단계적 추가.
 */

export type DraftGameBadge = "HOT" | "NEW" | "SOON" | null

export type DraftGamePosition = {
  code: string
  label: string
  color: string
  count: number
}

export type DraftCatalogEntry = {
  slug: string
  name: string
  emoji: string
  sport: "football" | "basketball" | "strategy" | "culture" | "cycling"
  themeColor: string
  blurb: string
  rosterSize: number
  budget: number
  currency: string
  poolSize: number
  avgMinutes: number
  plays: number
  formationOptions: string[]
  positions: DraftGamePosition[]
  badge: DraftGameBadge
  active: boolean
  /** UI 노출 차단. true 면 카드/Featured 모두에서 제외된다. */
  hidden?: boolean
}

export const DRAFT_GAMES: DraftCatalogEntry[] = [
  {
    slug: "epl",
    name: "EPL FPL 드래프트",
    emoji: "⚽",
    sport: "football",
    themeColor: "#38003c",
    blurb: "24-25 시즌 현역 200명. 예산 £80에 4-3-3을 짜라.",
    rosterSize: 11,
    budget: 80,
    currency: "£",
    poolSize: 218,
    avgMinutes: 8,
    plays: 12480,
    formationOptions: ["4-3-3", "4-4-2", "3-5-2", "5-3-2"],
    positions: [
      { code: "GK", label: "골키퍼", color: "#fbcd5a", count: 1 },
      { code: "DF", label: "수비", color: "#1f4d7a", count: 4 },
      { code: "MF", label: "미드필더", color: "#2a6a4a", count: 3 },
      { code: "FW", label: "공격", color: "#a0203b", count: 3 },
    ],
    badge: "HOT",
    active: false,
    hidden: true,
  },
  {
    slug: "arsenal",
    name: "아스널 레전드",
    emoji: "🔴",
    sport: "football",
    themeColor: "#ef0107",
    blurb: "1971 더블부터 2024 인비저블까지. 한 구단의 모든 시대 219명.",
    rosterSize: 11,
    budget: 100,
    currency: "$",
    poolSize: 219,
    avgMinutes: 7,
    plays: 0,
    formationOptions: ["4-3-3", "4-4-2", "3-4-3"],
    positions: [
      { code: "GK", label: "골키퍼", color: "#fbcd5a", count: 1 },
      { code: "DF", label: "수비", color: "#1f4d7a", count: 4 },
      { code: "MF", label: "미드필더", color: "#2a6a4a", count: 3 },
      { code: "FW", label: "공격", color: "#a0203b", count: 3 },
    ],
    badge: "HOT",
    active: true,
  },
  {
    slug: "slamdunk",
    name: "슬램덩크 드림팀",
    emoji: "🏀",
    sport: "basketball",
    themeColor: "#c8102e",
    blurb: "북산·산왕·해남·능남. 영광의 시대 5인 라인업.",
    rosterSize: 5,
    budget: 100,
    currency: "pts",
    poolSize: 42,
    avgMinutes: 5,
    plays: 0,
    formationOptions: ["positional"],
    positions: [
      { code: "PG", label: "포인트가드", color: "#fbcd5a", count: 1 },
      { code: "SG", label: "슈팅가드", color: "#c98615", count: 1 },
      { code: "SF", label: "스몰포워드", color: "#2a6a4a", count: 1 },
      { code: "PF", label: "파워포워드", color: "#1f4d7a", count: 1 },
      { code: "C", label: "센터", color: "#a0203b", count: 1 },
    ],
    badge: "SOON",
    active: false,
  },
  {
    slug: "3kingdoms",
    name: "삼국지 군단",
    emoji: "⚔️",
    sport: "strategy",
    themeColor: "#1a3a5c",
    blurb: "군주 1, 책사 1, 맹장 3. 충성도 80으로 천하를 도모하라.",
    rosterSize: 5,
    budget: 80,
    currency: "충",
    poolSize: 64,
    avgMinutes: 6,
    plays: 0,
    formationOptions: ["roles"],
    positions: [
      { code: "君", label: "군주", color: "#fbcd5a", count: 1 },
      { code: "士", label: "책사", color: "#5b3a8a", count: 1 },
      { code: "将", label: "맹장", color: "#a0203b", count: 3 },
    ],
    badge: "SOON",
    active: false,
  },
  {
    slug: "kpop",
    name: "K-POP 5인조",
    emoji: "🎤",
    sport: "culture",
    themeColor: "#ff6b9d",
    blurb: "2010년대~현재. 보컬, 댄서, 래퍼, 비주얼, 리더로 그룹을 만들어라.",
    rosterSize: 5,
    budget: 100,
    currency: "fan",
    poolSize: 0,
    avgMinutes: 4,
    plays: 0,
    formationOptions: ["positional"],
    positions: [],
    badge: "SOON",
    active: false,
  },
  {
    slug: "tour",
    name: "투르 드 프랑스 팀",
    emoji: "🚴",
    sport: "cycling",
    themeColor: "#fbcd5a",
    blurb: "에이스 1, 도메스티크 4. 21일 3주를 버틸 9인 로스터.",
    rosterSize: 9,
    budget: 120,
    currency: "€",
    poolSize: 0,
    avgMinutes: 9,
    plays: 0,
    formationOptions: ["roles"],
    positions: [],
    badge: "SOON",
    active: false,
  },
]

export function getDraftGame(slug: string): DraftCatalogEntry | undefined {
  return DRAFT_GAMES.find((g) => g.slug === slug)
}
