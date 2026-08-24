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
    // 2026-08-25 산정 (scripts/_draft-budget-sweep.ts, 예산당 160팀 표본).
    // 운영자 플레이 2회로 양쪽 끝을 다 밟아 본 뒤 정한 값이다:
    //   £70 "너무 빡세다"  ·  £90 "여유가 넘친다"
    //
    //   예산   남는돈   전력격차
    //   £70    £0.0     0.07   ← 붕괴. 누가 뽑든 총액이 같아진다
    //   £76    £0.4     0.93
    //   £80    £2.1     2.13   ← 여기서 선택이 갈리기 시작한다
    //   £85    £6.1     3.41
    //   £90   £10.9     3.76   ← 격차는 최고지만 매 픽의 압박이 사라진다
    //
    // ⚠️ 두 지표는 다른 것을 잰다. **전력격차**는 AI 결과가 갈리는 정도(£70 의 병)이고,
    //    **남는돈**은 사람이 매 픽마다 느끼는 압박(£90 의 병)이다. £80 은 격차를 붕괴
    //    구간에서 확실히 벗어나게 하면서(0.07 → 2.13) 잔액을 £2 로 묶어 끝까지 계산을
    //    시킨다. 예산을 다시 만질 일이 있으면 이 둘을 같이 볼 것 — 한쪽만 보면 £70
    //    (소진율 100% 를 성공으로 오독) 이나 £90 (격차만 보고 압박을 버림) 이 나온다.
    budget: 80,
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
