/**
 * Daily Round & Fixed Window Utilities
 *
 * 국내 토토(프로토) 시뮬레이션 규정:
 * - 23:00 KST: 데일리 회차 리셋 (볼 10개 리셋, 다음날 경기 리스트로 업데이트)
 * - 회차 범위: 당일 08:00 KST ~ 익일 08:00 KST 경기
 * - 베팅 가능 시간: 매일 08:00 ~ 23:00 KST (프로토 발매 시간).
 *   23:00~08:00 은 라인업 미리보기만 가능, 베팅 잠금 (2026-06-11 도입)
 * - 경기별 마감: min(킥오프, 당일 23:00)
 * - 하나의 데일리 회차에 betman gmTs 여러 개가 포함될 수 있음
 * - gmTs는 메타데이터 전용 — 표시/필터링에 사용 안 함
 */

/**
 * Compute KST daily_id from a match_time (ISO string or Date).
 * Used to assign games to daily rounds based on kickoff time.
 * 08:00 KST cutoff: games before 08:00 belong to previous day's round.
 */
export function computeDailyId(matchTime: string | Date): string {
  const d = new Date(matchTime)
  // Convert to KST (UTC+9)
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000
  // Subtract 8 hours for daily window (08:00 KST cutoff)
  const adjusted = new Date(kstMs - 8 * 60 * 60 * 1000)
  return adjusted.toISOString().split("T")[0] // YYYY-MM-DD
}

/**
 * Get the daily_id for the CURRENT viewing round.
 * 23:00 KST cutoff: at 23:00, flips to next day's round.
 *
 * Examples (KST):
 *   22:59 Feb 22 → "2026-02-22" (showing Feb 22 08:00 ~ Feb 23 08:00)
 *   23:00 Feb 22 → "2026-02-23" (showing Feb 23 08:00 ~ Feb 24 08:00)
 *   07:59 Feb 23 → "2026-02-23" (same round, games haven't started yet)
 *   08:00 Feb 23 → "2026-02-23" (same round, games begin)
 */
export function getTodayDailyId(): string {
  const now = new Date()
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  // Add 1 hour: at 23:00 KST → 00:00 next day → daily_id flips
  const adjusted = new Date(kstMs + 1 * 60 * 60 * 1000)
  return adjusted.toISOString().split("T")[0]
}

/**
 * Get fixed daily window boundaries: [dailyId 08:00 KST, dailyId+1 08:00 KST)
 * Flips at 23:00 KST to next day's window (via getTodayDailyId).
 */
export function getDailyWindow(overrideDailyId?: string): {
  start: Date
  end: Date
  dailyId: string
} {
  const dailyId = overrideDailyId || getTodayDailyId()
  // 08:00 KST = 23:00 UTC of the PREVIOUS calendar day
  // e.g. dailyId '2026-02-21' → start = 2026-02-20T23:00:00Z (= 2/21 08:00 KST)
  const start = new Date(new Date(`${dailyId}T23:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000) // 다음날 08:00 KST
  return { start, end, dailyId }
}

/** @deprecated Use getDailyWindow() instead */
export function getRolling24hWindow(): { start: Date; end: Date } {
  const { start, end } = getDailyWindow()
  return { start, end }
}

/** Check if current time is in betting hours (08:00 ~ 23:00 KST — 프로토 발매 시간) */
export function isBettingWindowOpen(now: Date = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24
  return kstHour >= 8 && kstHour < 23
}

/** Get the next 08:00 KST betting-open time as ISO string */
export function getNextBetOpenAt(now: Date = new Date()): string {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  const kstDateStr = new Date(kstMs).toISOString().split("T")[0]
  const todayOpen = new Date(`${kstDateStr}T08:00:00+09:00`)
  if (now < todayOpen) return todayOpen.toISOString()
  return new Date(todayOpen.getTime() + 24 * 60 * 60 * 1000).toISOString()
}

/** Get KST hour (0-23) */
export function getKSTHour(): number {
  const now = new Date()
  return (now.getUTCHours() + 9) % 24
}

/**
 * Per-game bet deadline = kickoff time.
 * Users can bet anytime until the match starts.
 * Game visibility is controlled by the daily round window (08:00~08:00).
 */
export function getGameBetDeadline(matchTime: string | Date): Date {
  return new Date(matchTime)
}

/** Check if a game is still bettable (before kickoff) */
export function isGameBettable(matchTime: string | Date): boolean {
  return new Date() < new Date(matchTime)
}

/** Format daily_id as Korean date label: "N월 D일 (요일)" */
export function formatDailyIdLabel(dailyId: string): string {
  const [year, month, day] = dailyId.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  return `${month}월 ${day}일 (${weekdays[date.getDay()]})`
}

/** Get bet_open_at for a daily_id (08:00 KST as ISO string) */
export function getBetOpenAt(dailyId: string): string {
  return `${dailyId}T08:00:00+09:00`
}

/** Get bet_close_at for a daily_id (23:00 KST as ISO string) */
export function getBetCloseAt(dailyId: string): string {
  return `${dailyId}T23:00:00+09:00`
}

/** Get the next 23:00 KST reset time as a Date */
export function getNextResetTime(): Date {
  const now = new Date()
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  const kstDate = new Date(kstMs)
  const kstDateStr = kstDate.toISOString().split("T")[0]

  // Today 23:00 KST = today 14:00 UTC
  const today2300 = new Date(`${kstDateStr}T14:00:00.000Z`)

  if (now < today2300) {
    return today2300
  }
  // Already past 23:00 KST → next day 23:00 KST
  return new Date(today2300.getTime() + 24 * 60 * 60 * 1000)
}

/** Get milliseconds until the next 23:00 KST reset */
export function getMsUntilReset(): number {
  return Math.max(0, getNextResetTime().getTime() - Date.now())
}

/** Get betting window status (프로토 발매 시간: 08:00 ~ 23:00 KST) */
export function getBettingWindowStatus(): {
  isOpen: boolean
  message: string
  nextOpenAt?: string
} {
  if (isBettingWindowOpen()) {
    return { isOpen: true, message: "베팅 가능" }
  }
  return {
    isOpen: false,
    message: "예측은 매일 오전 8시부터 밤 11시까지 가능합니다",
    nextOpenAt: getNextBetOpenAt(),
  }
}
