/**
 * 드래프트 게임 카탈로그.
 *
 * `/games/draft` 진입 화면 카드 그리드에서 사용. 활성 게임만 실제로 라우팅
 * 가능하며 (`/games/draft/{slug}`), 비활성 게임은 "준비 중" 으로 노출.
 *
 * Phase 1 (현재): EPL 만 실제 게임 화면 존재. 나머지는 카드만 표시.
 * Phase 2+: arsenal, slamdunk, 3kingdoms 등 실제 게임 화면 단계적 추가.
 */

type DraftGameBadge = "HOT" | "NEW" | "SOON" | null

type DraftGamePosition = {
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
  /**
   * 선수 풀 데이터 파일 (public/data/ 기준).
   * ⚠️ 종전엔 lib/draft/players.ts 가 arsenal-players.json 을 **하드코딩**했다 —
   *    그래서 EPL 슬러그가 "24-25 시즌 현역" 이라고 써 놓고 아스널 레전드를 띄웠다
   *    (2026-08-25 실측: 보드에 티에리 앙리·베르캄프가 나왔다).
   */
  dataFile: string
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
    blurb: "2026/27 FPL 등록 609명. 실제 몸값으로 11명을 짜라.",
    rosterSize: 11,
    // 2026-08-25 재산정 (scripts/_draft-budget-sweep.ts, 예산당 120팀 표본).
    // 처음엔 £70 이었는데 운영자 플레이에서 "너무 빡세다" — 숫자도 같은 말을 한다:
    //   £70  소진율 100% · 남는돈 £0.0 · 전력격차 0.09  ← 예산이 답을 정해버린다
    //   £90  소진율  88% · 남는돈 £10.9 · 전력격차 3.64  ← 고를 여지가 생긴다
    // £70 은 제약이 너무 세서 **누가 뽑든 총액이 같아졌다**(격차 ≈ 0). 드래프트가
    // 실력 게임이 되려면 선택이 갈려야 한다. 스타(£8+)는 609명 중 12명뿐이라 4팀이
    // 나누면 팀당 3명이 상한인데, £80 이상이면 이미 2.9로 포화라 희소성은 예산이 아니라
    // 스타 수가 정한다 — 즉 £70 의 빡빡함은 재미가 아니라 획일화만 만들고 있었다.
    budget: 90,
    currency: "£",
    poolSize: 609,
    avgMinutes: 8,
    plays: 12480,
    formationOptions: ["4-3-3", "4-4-2", "3-5-2", "5-3-2"],
    dataFile: "fpl-players.json",
    positions: [
      { code: "GK", label: "골키퍼", color: "#fbcd5a", count: 1 },
      { code: "DF", label: "수비", color: "#1f4d7a", count: 4 },
      { code: "MF", label: "미드필더", color: "#2a6a4a", count: 3 },
      { code: "FW", label: "공격", color: "#961E37", count: 3 },
    ],
    badge: "HOT",
    active: false,
    hidden: true,
  },
  {
    slug: "arsenal",
    name: "아스널 선수 드래프트",
    emoji: "🔴",
    sport: "football",
    themeColor: "#ef0107",
    blurb: "2003 인비저블부터 2026 현재까지. 아스널 한 구단의 선수 드래프트.",
    rosterSize: 11,
    budget: 100,
    currency: "$",
    poolSize: 219,
    avgMinutes: 7,
    plays: 0,
    formationOptions: ["4-3-3", "4-4-2", "3-4-3"],
    dataFile: "arsenal-players.json",
    positions: [
      { code: "GK", label: "골키퍼", color: "#fbcd5a", count: 1 },
      { code: "DF", label: "수비", color: "#1f4d7a", count: 4 },
      { code: "MF", label: "미드필더", color: "#2a6a4a", count: 3 },
      { code: "FW", label: "공격", color: "#961E37", count: 3 },
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
    dataFile: "arsenal-players.json",
    positions: [
      { code: "PG", label: "포인트가드", color: "#fbcd5a", count: 1 },
      { code: "SG", label: "슈팅가드", color: "#c98615", count: 1 },
      { code: "SF", label: "스몰포워드", color: "#2a6a4a", count: 1 },
      { code: "PF", label: "파워포워드", color: "#1f4d7a", count: 1 },
      { code: "C", label: "센터", color: "#961E37", count: 1 },
    ],
    badge: "SOON",
    active: false,
    hidden: true,
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
    dataFile: "arsenal-players.json",
    positions: [
      { code: "君", label: "군주", color: "#fbcd5a", count: 1 },
      { code: "士", label: "책사", color: "#5b3a8a", count: 1 },
      { code: "将", label: "맹장", color: "#961E37", count: 3 },
    ],
    badge: "SOON",
    active: false,
    hidden: true,
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
    dataFile: "arsenal-players.json",
    positions: [],
    badge: "SOON",
    active: false,
    hidden: true,
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
    dataFile: "arsenal-players.json",
    positions: [],
    badge: "SOON",
    active: false,
    hidden: true,
  },
]

export function getDraftGame(slug: string): DraftCatalogEntry | undefined {
  return DRAFT_GAMES.find((g) => g.slug === slug)
}
