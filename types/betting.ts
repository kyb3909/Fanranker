// Shared types, constants, and utility functions for betting components

// ============================================================
// Type Definitions
// ============================================================

export interface TodayInfo {
  date: string
  label: string
}

interface DailyRoundInfo {
  id: string
  daily_id: string
  status: string
  bet_open_at: string
  bet_close_at: string
  game_count: number
}

interface BettingWindowInfo {
  isOpen: boolean
  message: string
  nextOpenAt?: string
}

export interface SportsGame {
  id: string
  round_id: string
  daily_round_id?: string
  game_no: number
  match_time: string
  sport: "축구" | "농구" | "배구" | "야구"
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  handicap: number | null
  over_under_line: number | null
  venue: string
  status: string
  bet_close_at?: string
  is_bettable?: boolean
  // 매치 그룹 내 같은 (type, h, ou) 두번째 이상 row → 전반전 마켓 추정 (route.ts dedup).
  // sync.sh 가 betman 풀/전반을 한 game_type 으로 저장해서 우리 측 휴리스틱.
  is_half_time?: boolean
  home_odds?: number
  draw_odds?: number
  away_odds?: number
  over_odds?: number
  under_odds?: number
  odd_odds?: number
  even_odds?: number
}

export interface GroupedMatch {
  matchKey: string
  sport: string
  leagueCode: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  venue: string
  games: SportsGame[]
}

interface WindowInfo {
  start: string
  end: string
}

export interface SelectedBet {
  gameId: string
  matchKey: string
  selection: string
  sport: string
  gameType: string
  handicap: number | null
  overUnderLine: number | null
  odds?: number
}

export interface AlertModalState {
  isOpen: boolean
  type: "error" | "warning" | "success"
  title: string
  message: string
}

/** 예측 POST 응답의 경기별 픽 분포 (완료 모달용) */
export interface PickDistributionEntry {
  gameId: string
  homeTeam: string
  awayTeam: string
  gameType: string
  myPick: string
  counts: Record<string, number>
  total: number
}

/** 예측 완료 모달 상태 — 픽 분포 + 커뮤니티(축구 게시판) 섹션 노출 여부 */
export interface PredictionSuccessState {
  isOpen: boolean
  message: string
  distribution: PickDistributionEntry[]
  showCommunity: boolean
  /** 제출한 슬립의 종목 — 이벤트(건너스 레이스) 참가 피드백 노출 판정용 */
  sport?: string | null
}

export interface RankingUser {
  rank: number
  user_id: string
  nickname: string
  avatar_url: string | null
  sport: string
  total_predictions: number
  correct_predictions: number
  wrong_predictions?: number
  accuracy: number
  total_wagered: number
  total_returns?: number
  net_profit: number
  profit_rate: number
  current_streak: number
  best_win_streak: number
}

export interface MyRank {
  rank: number
  user_id: string
  nickname: string
  avatar_url: string | null
  sport: string
  total_predictions: number
  correct_predictions: number
  accuracy: number
  total_wagered: number
  net_profit: number
  profit_rate: number
  current_streak: number
  best_win_streak: number
}

export interface MyStatsData {
  summary: {
    total_predictions: number
    correct_predictions: number
    wrong_predictions: number
    cancelled_predictions: number
    accuracy: number
    total_wagered: number
    total_returns: number
    net_profit: number
    profit_rate: number
    current_streak: number
    best_win_streak: number
    worst_lose_streak: number
  } | null
  sports: {
    sport: string
    total_predictions: number
    correct_predictions: number
    wrong_predictions: number
    accuracy: number
    total_wagered: number
    total_returns: number
    net_profit: number
    profit_rate: number
    current_streak: number
    best_win_streak: number
  }[]
}

export interface PredictionMatch {
  league: string
  home: string
  away: string
  selection: string // 사용자 선택 (Korean: "홈팀" | "원정팀" | "무" | "오버" | "언더")
  odds: number // 사용자가 선택한 옵션의 배당률 (하위 호환)
  homeOdds?: number
  awayOdds?: number
  drawOdds?: number
  overOdds?: number
  underOdds?: number
  result: string // 개별 경기 결과: "win" | "lose" | "pending"
  correctAnswer?: string // 정답 선택지 라벨 (Korean: "홈팀" | "원정팀" | "무" | "오버" | "언더")
  gameType?: string // 게임 유형: "일반" | "핸디캡" | "언더오버" 등
  matchTime?: string | null // ISO 경기 시간
  homeScore?: number | null // 완료된 경기의 홈 점수
  awayScore?: number | null // 완료된 경기의 원정 점수
  venue?: string | null // 경기장
  handicap?: number | null // 핸디캡 값 (핸디캡 경기일 때)
  overUnderLine?: number | null // 언더오버 기준선
}

export interface PredictionHistoryItem {
  id: string
  date: string
  /** ISO 원본 날짜 — 날짜 구분선/그룹키 계산용. date는 표시용 "MM/DD HH:MM"이라 재파싱 시 연도가 깨짐(2001). */
  isoDate: string
  sport: string
  matches: PredictionMatch[]
  totalOdds: number
  stake: number
  status: string
  profit: number
}

// ============================================================
// Constants
// ============================================================

const gameTypeLabels: Record<string, string> = {
  일반: "승무패",
  S일반: "승무패",
  핸디캡: "핸디캡",
  S핸디캡: "핸디캡",
  언더오버: "언오버",
  S언더오버: "언오버",
  SUM: "합계",
  // 2026-05 betman 신 매핑 (사용자 동의 design 결정)
  승패2way: "승패",
  승1패: "승1패",
  승5패: "승5패",
  소수핸디캡: "핸디캡",
}

/**
 * game_type → UI 라벨 변환.
 *
 * "S" 접두사는 betman 전반전 마켓 식별자 (HANDI_VAL=6/7 등 → result-fetcher.ts).
 * 풀타임은 일반/핸디캡/언더오버, 전반전은 S일반/S핸디캡/S언더오버로 DB 저장.
 * betman 사이트는 "축구 전반 승무패"로 표기 — UI도 동일 의미를 ` · 전반` suffix로.
 *
 * - 일반/S일반 무승부 분기: hasDrawOdds 인자가 sport 가정보다 우선.
 *   KBO 풀타임은 2-way("승패"), KBO 전반은 3-way("승무패")처럼 sport만으론
 *   못 잡는 케이스를 draw_odds 데이터로 정확히 분기.
 * - 승패2way/승1패/승5패: gameTypeLabels 직접 매핑.
 * - 소수핸디캡: 무승부 없는 핸디 (betTypId=5) → "핸디캡" 라벨.
 */
export function getGameTypeLabel(
  rawGameType: string,
  sport?: string,
  hasDrawOdds?: boolean
): string {
  const isHalfTime = rawGameType.startsWith("S") && rawGameType !== "SUM"
  const baseType = isHalfTime ? rawGameType.slice(1) : rawGameType

  let baseLabel: string
  if (baseType === "일반") {
    if (hasDrawOdds !== undefined) {
      baseLabel = hasDrawOdds ? "승무패" : "승패"
    } else {
      const noDraw = sport === "농구" || sport === "야구" || sport === "배구"
      baseLabel = noDraw ? "승패" : "승무패"
    }
  } else if (sport === "배구" && (baseType === "소수핸디캡" || baseType === "핸디캡")) {
    // 배구 핸디캡 = 세트 핸디캡. 내부 game_type 은 소수핸디캡(2-way) 재사용, 표시만 종목 인지.
    baseLabel = "세트핸디캡"
  } else {
    baseLabel = gameTypeLabels[baseType] || baseType
  }

  return isHalfTime ? `${baseLabel} · 전반` : baseLabel
}

export const sportColors: Record<string, { bg: string; text: string; border: string }> = {
  soccer: {
    bg: "bg-gradient-to-r from-rose-50 to-pink-50",
    text: "text-rose-900",
    border: "border-rose-200",
  },
  축구: {
    // 프라이머리 burgundy(#8b1538) 의 연한 버전 — rose/pink 50-shade 그라데이션
    bg: "bg-gradient-to-r from-rose-50 to-pink-50",
    text: "text-rose-900",
    border: "border-rose-200",
  },
  야구: {
    bg: "bg-gradient-to-r from-blue-50 to-indigo-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  baseball: {
    bg: "bg-gradient-to-r from-blue-50 to-indigo-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  basketball: {
    bg: "bg-gradient-to-r from-orange-50 to-amber-50",
    text: "text-orange-900",
    border: "border-orange-200",
  },
  농구: {
    bg: "bg-gradient-to-r from-orange-50 to-amber-50",
    text: "text-orange-900",
    border: "border-orange-200",
  },
  배구: {
    bg: "bg-gradient-to-r from-purple-50 to-violet-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
  volleyball: {
    bg: "bg-gradient-to-r from-purple-50 to-violet-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
}

export const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  축구: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  야구: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  baseball: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  basketball: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  농구: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  배구: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  volleyball: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

const SPORT_ICONS: Record<string, string> = {
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

/**
 * 승부예측 종목 탭 — 당분간 **축구만** (운영자 2026-08-14).
 * 탭이 1개면 SportLeagueFilter 가 종목 줄 자체를 감추고 리그 칩만 보여준다.
 * 종목 확장 시: 아래 주석 해제 + use-betting-matches 기본값·prediction SSR 파라미터 복원.
 */
type SportFilterId = "all" | "축구" | "야구" | "농구" | "배구"

// as const 를 쓰지 않는다 — 탭이 하나면 id 가 "축구" 리터럴로 좁아져 "all" 분기가
// 타입 에러가 된다 (종목 확장 시 되돌릴 코드를 지금 지우게 만드는 함정).
export const SPORT_TABS: { id: SportFilterId; label: string; icon: string }[] = [
  { id: "축구", label: "축구", icon: "⚽" },
  // { id: "all", label: "전체", icon: "🎯" },
  // { id: "야구", label: "야구", icon: "⚾" },
  // { id: "농구", label: "농구", icon: "🏀" },
  // { id: "배구", label: "배구", icon: "🏐" },
]

// ============================================================
// Utility Functions
// ============================================================

export function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date
    .toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(". ", ".")
    .replace(". ", " ")
}

function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
