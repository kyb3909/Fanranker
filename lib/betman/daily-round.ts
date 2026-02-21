/**
 * Daily Round & Fixed Window Utilities
 *
 * Daily window: [today 08:00 KST, tomorrow 08:00 KST)
 * Betting blackout: 23:00~08:00 KST (no betting allowed)
 * Per-game bet_close_at = MIN(kickoff, same_KST_calendar_day 23:00 KST)
 * Daily round resets at 23:00 KST (balls → 10, pending data invalidated, new round starts)
 * 23:00 KST = system day boundary (시스템 기준 하루 시작 시점)
 * gmTs is metadata only — never used for display/eligibility filtering.
 */

/** Compute KST daily_id from a match_time (ISO string or Date) */
export function computeDailyId(matchTime: string | Date): string {
  const d = new Date(matchTime)
  // Convert to KST (UTC+9)
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000
  // Subtract 8 hours for daily window (08:00 KST cutoff)
  const adjusted = new Date(kstMs - 8 * 60 * 60 * 1000)
  return adjusted.toISOString().split('T')[0] // YYYY-MM-DD
}

/** Get today's daily_id in KST */
export function getTodayDailyId(): string {
  const now = new Date()
  return computeDailyId(now)
}

/**
 * Get fixed daily window boundaries: [today 08:00 KST, tomorrow 08:00 KST)
 *
 * Before 08:00 KST → previous day's window (yesterday 08:00 ~ today 08:00)
 * After  08:00 KST → today's window (today 08:00 ~ tomorrow 08:00)
 */
export function getDailyWindow(): { start: Date; end: Date; dailyId: string } {
  const dailyId = getTodayDailyId()
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

/** Check if current time is in betting window (08:00-23:00 KST) */
export function isBettingWindowOpen(): boolean {
  const now = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  return kstHour >= 8 && kstHour < 23
}

/** Get KST hour (0-23) */
export function getKSTHour(): number {
  const now = new Date()
  return (now.getUTCHours() + 9) % 24
}

/**
 * Per-game bet deadline: MIN(kickoff, same_KST_calendar_day 23:00)
 *
 * - For daytime matches (08:00-22:59 KST): closes at kickoff
 * - For matches at/after 23:00 KST: closes at 23:00 KST same day
 * - For post-midnight matches (00:00-07:59 KST): closes at kickoff,
 *   but blackout enforcement (isBettingWindowOpen) prevents betting
 *   after 23:00, so effective deadline is previous evening 23:00.
 */
export function getGameBetDeadline(matchTime: string | Date): Date {
  const kickoff = new Date(matchTime)
  // Get the KST calendar date of the kickoff
  const kstMs = kickoff.getTime() + 9 * 60 * 60 * 1000
  const kstDateStr = new Date(kstMs).toISOString().split('T')[0]
  // Same calendar day 23:00 KST = 14:00 UTC of that date
  const sameDay2300KST = new Date(`${kstDateStr}T14:00:00.000Z`)
  return kickoff < sameDay2300KST ? kickoff : sameDay2300KST
}

/** Check if a game is still bettable (before deadline AND within betting hours) */
export function isGameBettable(matchTime: string | Date): boolean {
  const now = new Date()
  const deadline = getGameBetDeadline(matchTime)
  return now < deadline && isBettingWindowOpen()
}

/** Format daily_id as Korean date label: "N월 D일 (요일)" */
export function formatDailyIdLabel(dailyId: string): string {
  const [year, month, day] = dailyId.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
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
  const kstDateStr = kstDate.toISOString().split('T')[0]

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

/** Get betting window status message */
export function getBettingWindowStatus(): {
  isOpen: boolean
  message: string
  nextOpenAt?: string
} {
  const kstHour = getKSTHour()

  if (kstHour >= 8 && kstHour < 23) {
    return { isOpen: true, message: '베팅 가능' }
  }

  // Dead zone: 23:00~08:00
  const todayId = getTodayDailyId()
  if (kstHour >= 23) {
    // After 23:00, next open is tomorrow 08:00
    const tomorrow = new Date(`${todayId}T00:00:00+09:00`)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextDailyId = tomorrow.toISOString().split('T')[0]
    return {
      isOpen: false,
      message: '내일 08:00부터 베팅 가능',
      nextOpenAt: getBetOpenAt(nextDailyId),
    }
  }

  // Before 08:00
  return {
    isOpen: false,
    message: '08:00부터 베팅 가능',
    nextOpenAt: getBetOpenAt(todayId),
  }
}
