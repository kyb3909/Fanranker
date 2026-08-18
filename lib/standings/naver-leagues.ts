/**
 * 네이버 스포츠 순위표 페이지 URL (기록/순위)
 * PC: sports.news.naver.com (링크용) / 스크래핑: m.sports.naver.com (모바일)
 */
const NAVER_SPORTS_BASE = "https://sports.news.naver.com"
const NAVER_SPORTS_MOBILE_BASE = "https://m.sports.naver.com"

interface StandingsLeague {
  id: string
  name: string
  /** 위젯 탭용 짧은 라벨 (예: EN, K1, K2) */
  tabLabel?: string
  category?: string
  /** 네이버 스포츠 기록/순위 경로 (앞에 / 붙이면 BASE와 결합) */
  path: string
  /** 모바일 스크래핑 시 시즌 쿼리 (예: epl lji9) */
  seasonCode?: string
}

export const STANDINGS_LEAGUES: StandingsLeague[] = [
  // 야구
  {
    id: "kbo",
    name: "KBO",
    tabLabel: "KBO",
    path: "/kbaseball/record/index",
    category: "kbo",
    seasonCode: "2025",
  },
  {
    id: "mlb",
    name: "MLB",
    tabLabel: "MLB",
    path: "/wbaseball/record/index",
    category: "mlb",
    seasonCode: "2025",
  },
  {
    id: "npb",
    name: "NPB",
    tabLabel: "NPB",
    path: "/wbaseball/record/index",
    category: "npb",
    seasonCode: "2025",
  },
  // 축구 (국내)
  {
    id: "kleague1",
    name: "K리그1",
    tabLabel: "K1",
    path: "/kfootball/record/index",
    category: "kleague",
    seasonCode: "2026",
  },
  {
    id: "kleague2",
    name: "K리그2",
    tabLabel: "K2",
    path: "/kfootball/record/index",
    category: "kleague2",
    seasonCode: "2026",
  },
  // 축구 (해외)
  { id: "epl", name: "EPL", tabLabel: "EN", path: "/wfootball/record/epl", seasonCode: "lji9" },
  {
    id: "laliga",
    name: "라리가",
    tabLabel: "SP",
    path: "/wfootball/record/laliga",
    category: "primera",
    seasonCode: "Igrb",
  },
  {
    id: "seriea",
    name: "세리에A",
    tabLabel: "IT",
    path: "/wfootball/record/seriea",
    category: "seria",
    seasonCode: "hDj5",
  },
  {
    id: "ligue1",
    name: "리그앙",
    tabLabel: "FR",
    path: "/wfootball/record/ligue1",
    seasonCode: "eJUK",
  },
  {
    id: "bundesliga",
    name: "분데스리가",
    tabLabel: "DE",
    path: "/wfootball/record/bundesliga",
    seasonCode: "lvYe",
  },
  // 농구 (국내)
  { id: "kbl", name: "KBL", tabLabel: "KBL", path: "/basketball/record/kbl", seasonCode: "47" },
  {
    id: "wkbl",
    name: "WKBL",
    tabLabel: "WKBL",
    path: "/basketball/record/wkbl",
    seasonCode: "046",
  },
  // 농구 (해외)
  { id: "nba", name: "NBA", tabLabel: "NBA", path: "/basketball/record/nba", seasonCode: "2025" },
  // 배구 (국내)
  {
    id: "kovo_men",
    name: "KOVO 남자",
    tabLabel: "KOVO남",
    path: "/volleyball/record/index",
    category: "kovo",
    seasonCode: "022",
  },
  {
    id: "kovo_women",
    name: "KOVO 여자",
    tabLabel: "KOVO여",
    path: "/volleyball/record/index",
    category: "wkovo",
    seasonCode: "022",
  },
]

function buildNaverUrl(league: StandingsLeague): string {
  const base = NAVER_SPORTS_BASE
  if (league.category) {
    return `${base}${league.path}?category=${league.category}`
  }
  return `${base}${league.path}`
}

function getStandingsUrl(leagueId: string): string | null {
  const league = STANDINGS_LEAGUES.find((l) => l.id === leagueId)
  if (!league) return null
  return buildNaverUrl(league)
}

/** 스크래퍼 전용 URL (모바일 + tab=teamRank, 필요 시 seasonCode) */
export function getStandingsScrapeUrl(leagueId: string): string | null {
  const league = STANDINGS_LEAGUES.find((l) => l.id === leagueId)
  if (!league) return null
  const base = NAVER_SPORTS_MOBILE_BASE
  const params = new URLSearchParams()
  if (league.seasonCode) params.set("seasonCode", league.seasonCode)
  if (league.category) params.set("category", league.category)
  params.set("tab", "teamRank")
  return `${base}${league.path}?${params.toString()}`
}

export function getLeagueById(leagueId: string): StandingsLeague | null {
  return STANDINGS_LEAGUES.find((l) => l.id === leagueId) ?? null
}

/** 리그별 그룹(디비전/컨퍼런스) 서브탭 정의 */
interface LeagueGroup {
  key: string
  label: string
  /** group 필드 매칭값 */
  group?: string
  /** division 필드 매칭값 */
  division?: string
}

const LEAGUE_GROUPS: Record<string, LeagueGroup[]> = {
  mlb: [
    { key: "al_east", label: "AL 동부", group: "AL", division: "EAST" },
    { key: "al_cent", label: "AL 중부", group: "AL", division: "CENT" },
    { key: "al_west", label: "AL 서부", group: "AL", division: "WEST" },
    { key: "nl_east", label: "NL 동부", group: "NL", division: "EAST" },
    { key: "nl_cent", label: "NL 중부", group: "NL", division: "CENT" },
    { key: "nl_west", label: "NL 서부", group: "NL", division: "WEST" },
  ],
  npb: [
    { key: "cl", label: "센트럴", group: "CL" },
    { key: "pl", label: "퍼시픽", group: "PL" },
  ],
  nba: [
    { key: "east", label: "동부", group: "EASTERN" },
    { key: "west", label: "서부", group: "WESTERN" },
  ],
}

function getLeagueGroups(leagueId: string): LeagueGroup[] | null {
  return LEAGUE_GROUPS[leagueId] ?? null
}

type SportKey = "football" | "baseball" | "basketball" | "volleyball"

const SPORT_TABS: { key: SportKey; label: string }[] = [
  { key: "football", label: "축구" },
  { key: "baseball", label: "야구" },
  { key: "basketball", label: "농구" },
  { key: "volleyball", label: "배구" },
]

const SPORT_LEAGUE_IDS: Record<SportKey, string[]> = {
  // 2026-08-19 운영자: "K리그·J리그는 승부예측 메뉴에만 두고 나머지는 가려줘".
  // 목록에서 빼는 것으로 충분하다 — STANDINGS_LEAGUES 정의는 남겨 두어 되살리기 쉽게.
  football: ["epl", "laliga", "bundesliga", "seriea", "ligue1"],
  baseball: ["kbo", "mlb", "npb"],
  basketball: ["kbl", "wkbl", "nba"],
  volleyball: ["kovo_men", "kovo_women"],
}

function getLeaguesBySport(sport: SportKey): StandingsLeague[] {
  const ids = SPORT_LEAGUE_IDS[sport] ?? []
  return ids
    .map((id) => STANDINGS_LEAGUES.find((l) => l.id === id))
    .filter((l): l is StandingsLeague => !!l)
}
