/**
 * Betman 경기 결과 매퍼 — 정산 로직 공용 모듈.
 *
 * 기존에 app/api/betman/results/route.ts, app/api/cron/betman-sync/route.ts,
 * scripts/*.ts에 각기 복제돼 있던 3개 함수를 단일 모듈로 통합.
 *
 * audit: docs/audit-2026-04-17.md §아키-5.1 (S1)
 *
 * 이번 스코프: Vercel 서버 routes 2곳. VPS scripts는 별도 배포 사이클이라
 * 이 모듈은 아직 직접 참조하지 않지만, 향후 path alias 세팅 후 동일 import로 통일 가능.
 */

export type BetmanResult =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "odd"
  | "even"
  | "cancelled"
  | ""

/** Betman 공식 게임 타입 (한국어 원문). */
export type BetmanGameType =
  | "일반"
  | "핸디캡"
  | "S핸디캡"
  | "언더오버"
  | "S언더오버"
  | "SUM"
  | "SSUM"
  | string

/**
 * 크롤러가 제공한 GAME_RESULT 코드를 기반으로 결과를 매핑한다.
 *
 * Betman GAME_RESULT 규칙:
 *   - "4": 경기 취소
 *   - 일반/핸디캡/S핸디캡: "0" = home, "1" = draw, "2" = away
 *   - 언더오버/S언더오버:  "0" = under, "2" = over
 *   - SUM:                 "0" = odd,   "2" = even
 *
 * 매핑 실패(알 수 없는 코드 or 게임 타입)는 `{ result: "", status: "completed" }`로
 * fallback — 호출부에서 score 기반 추론(`deriveResultFromScore`)으로 재시도한다.
 */
export function mapGameResult(
  rawGameResult: string | number,
  gameType: BetmanGameType
): { result: BetmanResult; status: "completed" | "cancelled" } {
  const gameResult = String(rawGameResult)

  if (gameResult === "4") return { result: "cancelled", status: "cancelled" }

  if (gameType === "일반" || gameType === "핸디캡" || gameType === "S핸디캡") {
    if (gameResult === "0") return { result: "home", status: "completed" }
    if (gameResult === "1") return { result: "draw", status: "completed" }
    if (gameResult === "2") return { result: "away", status: "completed" }
  } else if (gameType === "언더오버" || gameType === "S언더오버") {
    if (gameResult === "0") return { result: "under", status: "completed" }
    if (gameResult === "2") return { result: "over", status: "completed" }
  } else if (gameType === "SUM" || gameType === "SSUM") {
    if (gameResult === "0") return { result: "odd", status: "completed" }
    if (gameResult === "2") return { result: "even", status: "completed" }
  }

  return { result: "", status: "completed" }
}

/**
 * 실제 스코어와 게임 조건으로부터 결과를 추론한다.
 * 크롤러가 GAME_RESULT를 주지 않거나 매핑 실패 시 fallback.
 *
 * - 핸디캡/S핸디캡: homeScore에 handicap을 더한 값으로 비교
 * - 언더오버/S언더오버: 총점과 line 비교. line이 0이면 ""로 반환(결과 불명).
 * - SUM: 총점이 짝수면 "even", 홀수면 "odd"
 * - 그 외(일반): 단순 점수 비교
 */
export function deriveResultFromScore(
  homeScore: number,
  awayScore: number,
  gameType: BetmanGameType,
  handicap: number | null,
  overUnderLine: number | null
): BetmanResult {
  if (gameType === "핸디캡" || gameType === "S핸디캡") {
    const adjusted = homeScore + (handicap ?? 0)
    if (adjusted > awayScore) return "home"
    if (adjusted < awayScore) return "away"
    return "draw"
  }

  if (gameType === "언더오버" || gameType === "S언더오버") {
    const line = overUnderLine ?? 0
    if (line === 0) return ""
    const total = homeScore + awayScore
    if (total > line) return "over"
    if (total < line) return "under"
    return ""
  }

  if (gameType === "SUM" || gameType === "SSUM") {
    const total = homeScore + awayScore
    return total % 2 === 0 ? "even" : "odd"
  }

  if (homeScore > awayScore) return "home"
  if (homeScore < awayScore) return "away"
  return "draw"
}

/**
 * "3:1" 같은 Betman 스코어 문자열을 파싱. 유효하지 않으면 null.
 */
export function parseScore(
  mchScore: string | undefined | null
): { home: number; away: number } | null {
  if (!mchScore || !mchScore.includes(":")) return null
  const [h, a] = mchScore.split(":").map(Number)
  if (isNaN(h) || isNaN(a)) return null
  if (!Number.isInteger(h) || !Number.isInteger(a)) return null
  return { home: h, away: a }
}
