/**
 * 스윕 크론의 경기별 결과를 **정상 대기**와 **우리 장애**로 가른다 — 순수 모듈 (2026-09-07).
 *
 * 불판(match-threads)·MoTM(motm-sync) 크론은 경기마다 skipped 사유를 남기지만 응답은 늘 200 이었다.
 * 48시간 실행 1,900회 중 오류 3회인 기간에 리포트 대상 22경기 중 7경기가 자동으로 안 만들어졌다 —
 * 실행 성공률과 경기별 완료율은 다른 숫자다. 여기서 사유를 분류해 라우트가 503 을 내게 한다.
 *
 * 정상 사유(200 유지):
 *  - 기존 글·폴이 있다 / 라인업이 아직 예상이다 / 라인업이 없거나 얇다 / 보강할 것이 없다
 *  - 유니크 충돌(23505) = 동시 실행 레이스에서 다른 인스턴스가 먼저 만든 것
 * 그 밖의 사유(조회 실패·삽입 오류·예외 메시지)는 우리 장애 → 503.
 *
 * ⚠️ 사유 문자열의 정본은 lib/match/thread.ts · lib/motm/poll.ts 다. 여기서는 읽기만 한다.
 */

const UNIQUE_VIOLATION = "23505"

/** "insert: 23505" 와 "insert:23505" 를 같은 것으로 본다 (두 스윕의 표기가 다르다) */
function normalize(reason: string): string {
  return String(reason ?? "")
    .trim()
    .replace(/^(insert|repair):\s*/, "$1:")
}

export const THREAD_NORMAL_SKIPS: ReadonlySet<string> = new Set([
  "exists",
  "lineup-not-ready",
  `insert:${UNIQUE_VIOLATION}`,
])

export const MOTM_NORMAL_SKIPS: ReadonlySet<string> = new Set([
  "no_lineup",
  "thin_lineup",
  "repair_noop",
  `insert:${UNIQUE_VIOLATION}`,
])

export function isInternalThreadSkip(reason: string): boolean {
  return !THREAD_NORMAL_SKIPS.has(normalize(reason))
}

export function isInternalMotmSkip(reason: string): boolean {
  return !MOTM_NORMAL_SKIPS.has(normalize(reason))
}

/** skipped 목록에서 우리 장애만 골라낸다 — 라우트가 이 배열의 길이로 503 을 정한다 */
export function internalFailures<T extends { reason: string }>(
  skipped: T[],
  isInternal: (reason: string) => boolean
): T[] {
  return (skipped ?? []).filter((s) => isInternal(s.reason))
}
