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
  /** 베트맨 확정값 (completed 후의 betman_games.home_score/away_score — 지급 기준) */
  betman: ScorePairInput
  /**
   * 와이즈토토 보존값 — **경기 종료 후 캡처분만** 넘길 것 (킥오프+105분 이전 캡처는
   * 미완 스코어라 호출부가 null 로 걸러야 한다). 커버리지 밖/보존 이전 데이터면 null.
   */
  wisetoto?: ScorePairInput | null
  /** 산 피드 색인 항목 — 색인에 없으면 null */
  lfa: { finished: boolean; homeScore: number | null; awayScore: number | null } | null
  /** 킥오프 이후 경과 시간 */
  hoursSinceKickoff: number
}

export interface VerdictResult {
  verdict: CheckVerdict
  betmanScore: string | null
  wisetotoScore: string | null
  lfaScore: string | null
  note: string | null
}

function pair(h: number | null, a: number | null): string | null {
  return h == null || a == null ? null : `${h}-${a}`
}

/**
 * ② result 필드 ↔ 검증 스코어 정합성 (2026-08-30 운영자 지적).
 *
 * 정산은 `betman_games.result` 로 지급하는데, 그 값은 betman.co.kr 크롤이 채운다.
 * 스코어(LFA×와이즈토토)만 검증하면 **정산이 실제로 읽는 값이 검증 밖**이다.
 * 검증된 스코어에서 그 행의 마켓 규칙(승무패/핸디캡/언더오버…)으로 result 를
 * 재계산해 저장값과 대조한다. 어긋나면 크롤 버그·경기 매핑 오류·수동 입력 실수다.
 *
 * 판단 불가는 통과시킨다:
 *  · 저장 result 가 비어 있으면 — 정산 가드가 어차피 그 행을 안 정산한다
 *  · 재계산이 "" 이면 (언더오버 line 0 등) — 규칙상 유도 불가
 *  · cancelled 는 스코어와 무관한 상태 결정
 */
export function checkResultConsistency(input: {
  homeScore: number
  awayScore: number
  storedResult: string | null
  /** deriveResultFromScore 재계산값 — 호출부가 result-mapper 로 계산해 넘긴다 */
  expectedResult: string
}): { ok: boolean; note: string | null } {
  const stored = (input.storedResult ?? "").trim()
  if (stored === "" || stored === "cancelled") return { ok: true, note: null }
  if (input.expectedResult === "") return { ok: true, note: null }
  if (stored === input.expectedResult) return { ok: true, note: null }
  return {
    ok: false,
    note: `result 불일치 — 저장 ${stored} / 스코어(${input.homeScore}-${input.awayScore}) 계산 ${input.expectedResult}`,
  }
}

/**
 * ① 스코어 3자 다수결 (2026-08-30 운영자: "와이즈토토와 베트맨이 같은지 검증이 중요").
 *
 *   베트맨 == 와이즈토토             → match (LFA 가 달라도 다수결 통과, 원장에 참고 기록)
 *   베트맨 != 와이즈토토, LFA==베트맨 → match (와이즈토토가 소수 — 참고 기록)
 *   베트맨 != 와이즈토토, LFA==와이즈 → mismatch — **1차 출처(베트맨)가 소수. 가장 위험**
 *   베트맨 != 와이즈토토, LFA 부재    → mismatch — 국내 두 출처 불일치·심판 부재 → 보류
 *   와이즈토토 부재                 → 기존 2자(베트맨↔LFA) 판정으로 폴백
 */
export function decideVerdict(input: VerdictInput): VerdictResult {
  const betmanScore = pair(input.betman.home, input.betman.away)
  const wisetotoScore = input.wisetoto ? pair(input.wisetoto.home, input.wisetoto.away) : null
  const lfaScore = input.lfa ? pair(input.lfa.homeScore, input.lfa.awayScore) : null
  const lfaUsable = !!input.lfa && input.lfa.finished && lfaScore != null
  const overdue = input.hoursSinceKickoff >= WAIVE_HOURS
  const base = { betmanScore, wisetotoScore, lfaScore }

  // 베트맨(지급 기준) 스코어가 아직 비었으면 비교 자체가 불가
  if (betmanScore == null) {
    return { verdict: overdue ? "waived" : "pending", ...base, note: null }
  }

  // ── 와이즈토토 보존값이 있으면 그게 1순위 교차 상대다 ──
  if (wisetotoScore != null) {
    if (betmanScore === wisetotoScore) {
      return {
        verdict: "match",
        ...base,
        note: lfaUsable && lfaScore !== betmanScore ? `LFA 상이(참고): ${lfaScore}` : null,
      }
    }
    if (lfaUsable && lfaScore === betmanScore) {
      return {
        verdict: "match",
        ...base,
        note: `와이즈토토 소수(${wisetotoScore}) — LFA 가 베트맨 지지`,
      }
    }
    if (lfaUsable && lfaScore === wisetotoScore) {
      return {
        verdict: "mismatch",
        ...base,
        note: `⚠️ 베트맨(${betmanScore})이 소수 — 와이즈토토·LFA 는 ${wisetotoScore}`,
      }
    }
    return {
      verdict: "mismatch",
      ...base,
      note: `베트맨 ${betmanScore} vs 와이즈토토 ${wisetotoScore} — 심판(LFA) 부재`,
    }
  }

  // ── 와이즈토토 부재 (커버리지 밖/보존 이전 데이터) — 2자 판정 폴백 ──
  if (!lfaUsable) {
    return { verdict: overdue ? "waived" : "pending", ...base, note: null }
  }
  return {
    verdict: betmanScore === lfaScore ? "match" : "mismatch",
    ...base,
    note: betmanScore === lfaScore ? null : "스코어 불일치 (베트맨 vs LFA)",
  }
}
