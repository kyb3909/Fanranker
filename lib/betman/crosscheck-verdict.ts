/**
 * 결과 교차검증 판정 (2026-08-30 운영자 확정).
 *
 * "크로스 체크가 완료되고, 오류가 있으면 알림으로 알려주고, 그게 다 되어야
 *  이후에 맞춘 것도 정산" — 축구 정산 앞의 게이트가 이 판정을 따른다.
 *
 * ⚠️ Supabase 를 끌어오지 않는 **순수 모듈** — env 없이 테스트가 돈다
 *    (score-gate·goal-facts 와 같은 이유).
 *
 * ## 판정표
 *   match     LFA(산 피드)와 와이즈토토 스코어 일치 — 정산 허용
 *   mismatch  두 출처가 다르다 — 정산 보류 + 알림. 사람이 풀 때까지 안 나간다
 *   pending   LFA 미확인 (색인에 없음/종료 전/스코어 없음) — 다음 크론에 재시도
 *   waived    유예 시한(WAIVE_HOURS) 넘도록 LFA 확인 불가 — 커버리지 밖(마이너 리그
 *             등)으로 보고 와이즈토토 단독 정산 허용. 이 출구가 없으면 LFA 가 안
 *             다루는 경기의 유저 지급이 영영 얼어붙는다. waive 시에도 알림은 남긴다.
 */

export type CheckVerdict = "match" | "mismatch" | "pending" | "waived"

/** LFA 확인 불가 상태가 이 시간을 넘으면 waived — 경기 2h + 동기화 여유를 크게 잡았다 */
export const WAIVE_HOURS = 12

export interface ScorePairInput {
  home: number | null
  away: number | null
}

export interface VerdictInput {
  /** 산 피드 색인 항목 — 색인에 없으면 null */
  lfa: { finished: boolean; homeScore: number | null; awayScore: number | null } | null
  /** 와이즈토토 값 (betman_games.home_score/away_score) */
  betman: ScorePairInput
  /** 킥오프 이후 경과 시간 */
  hoursSinceKickoff: number
}

export interface VerdictResult {
  verdict: CheckVerdict
  betmanScore: string | null
  lfaScore: string | null
}

function pair(h: number | null, a: number | null): string | null {
  return h == null || a == null ? null : `${h}-${a}`
}

export function decideVerdict(input: VerdictInput): VerdictResult {
  const betmanScore = pair(input.betman.home, input.betman.away)
  const lfaScore = input.lfa ? pair(input.lfa.homeScore, input.lfa.awayScore) : null
  const overdue = input.hoursSinceKickoff >= WAIVE_HOURS

  // LFA 쪽이 확인 불가 — 색인에 없거나, 아직 종료 전이거나, 스코어가 비었거나
  if (!input.lfa || !input.lfa.finished || lfaScore == null) {
    return { verdict: overdue ? "waived" : "pending", betmanScore, lfaScore }
  }
  // 와이즈토토 스코어가 아직 비었으면 비교 자체가 불가
  if (betmanScore == null) {
    return { verdict: overdue ? "waived" : "pending", betmanScore, lfaScore }
  }
  return {
    verdict: betmanScore === lfaScore ? "match" : "mismatch",
    betmanScore,
    lfaScore,
  }
}
