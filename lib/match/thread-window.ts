const HOUR_MS = 3600_000
export const THREAD_BEFORE_MS = 90 * 60_000
export const THREAD_AFTER_MS = 120 * 60_000

/** 킥오프 후보 구간이 걸치는 매치데이만 조회한다. 경계 시각은 호출부의 정본을 받는다. */
export function threadMatchdays(now: number, matchdayStartHourKst: number): string[] {
  const offset = (9 - matchdayStartHourKst) * HOUR_MS
  const first = new Date(now - THREAD_AFTER_MS + offset).toISOString().slice(0, 10)
  const last = new Date(now + THREAD_BEFORE_MS + offset).toISOString().slice(0, 10)
  return first === last ? [first] : [first, last]
}
