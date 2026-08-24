import type { LfaMatch } from "@/lib/lfa/client"

/**
 * 하루치 목록을 얼마나 자주 다시 살 것인가 — **그날 경기 상황이 정한다** (2026-08-24 비용 감사).
 *
 * ## 왜 이 파일이 따로 있나
 * 이 함수 하나가 유료 크레딧 소모의 절반을 결정한다. 호출 1회 = 1크레딧이고,
 * `matches?date=` 는 모든 기능(라인업·스탯·불판·일정·홈 밴드)이 공유하는 앞단이다.
 * 순수 함수로 떼어 놔야 시험이 붙는다 — persist.ts 에 두면 Supabase 를 끌고 온다.
 *
 * ## 무엇이 문제였나
 * 종전엔 **달력 위치**만 봤다: "오늘이거나 아직 안 지난 날이면 무조건 5분".
 * 그래서 경기가 한 경기도 없는 날짜도, 이미 전 경기가 끝난 날짜도 5분마다 다시 샀다.
 * 실측으로 **동시에 3개 날짜**(어제 UTC·오늘 UTC·내일 UTC)가 그 대접을 받고 있었고,
 * 유럽 경기가 없는 KST 낮 시간대에도 시간당 45크레딧이 나갔다 — 하루 1,073,
 * 그날 소모의 절반이 "아무 일도 없는 시간"에서 나갔다.
 *
 * 목록에서 값이 실제로 **움직이는 건 경기가 진행 중일 때뿐**이다. 킥오프 전 일정은
 * 5분마다 바뀌지 않고, 끝난 경기 스코어는 영영 안 바뀐다.
 *
 * ⚠️ 불변식: **유휴 주기 < 킥오프 예열창**. 그래야 유휴 상태로 자다가 킥오프를 통째로
 *    놓치는 구간이 안 생긴다 — 마지막 구매가 아무리 늦어도 킥오프 45분 전 안쪽에서
 *    한 번 더 일어나고 거기서 빠른 주기로 전환된다. 둘 중 하나를 건드리면 이 부등호를
 *    반드시 같이 확인할 것 (`__tests__/lib/lfa-day-freshness.test.ts` 가 지킨다).
 */
export const PRE_KICKOFF_MS = 45 * 60_000
export const MATCH_WINDOW_MS = 3.5 * 3600_000
export const FRESH_DAY_MATCHDAY_MS = 5 * 60_000
export const FRESH_DAY_IDLE_MS = 30 * 60_000

export function dayFreshnessMs(dateUtc: string, matches: LfaMatch[]): number {
  const now = Date.now()
  const dayEnd = Date.parse(`${dateUtc}T00:00:00.000Z`) + 24 * 3600_000

  // 목록이 빈 날짜: 이미 다 지났으면 굳은 것, 아직이면 나중에 일정이 붙을 수 있다
  if (matches.length === 0) return now > dayEnd ? Infinity : FRESH_DAY_IDLE_MS

  let anyUnfinished = false
  for (const m of matches) {
    if (m.status?.is_live) return FRESH_DAY_MATCHDAY_MS
    const finished = m.status?.state === "postGame" || m.status?.display === "FT"
    if (finished) continue
    anyUnfinished = true
    // kickoff 는 그 UTC 날짜의 "HH:MM"
    const ko = /^\d{2}:\d{2}$/.test(m.kickoff) ? Date.parse(`${dateUtc}T${m.kickoff}:00.000Z`) : NaN
    if (!Number.isFinite(ko)) continue
    if (now >= ko - PRE_KICKOFF_MS && now <= ko + MATCH_WINDOW_MS) return FRESH_DAY_MATCHDAY_MS
  }

  // 안 끝난 경기가 하나도 없다 = 이 날짜는 굳었다. KST 날짜가 넘어갈 때까지 17시간을
  // 5분마다 다시 사던 "어제 UTC" 가 여기서 멈춘다.
  return anyUnfinished ? FRESH_DAY_IDLE_MS : Infinity
}
