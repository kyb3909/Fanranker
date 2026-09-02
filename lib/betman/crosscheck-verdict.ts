/**
 * 결과 교차검증 판정 — **표시·알림 전용** (2026-09-02 운영자 확정).
 *
 * 2026-08-30 에 "판정이 match/waived 여야만 정산" 게이트의 두뇌로 만들어졌다가, 9/2 에
 * 역할이 바뀌었다. 4일간의 실측: mismatch 45건이 **전부 대조기 자신의 오류**였고(동시
 * 킥오프 매칭 충돌 35 · 소수핸디캡 미처리 6 · 리그 오매핑 4), 진짜 betman-LFA 불일치는
 * 0건, 경기의 68% 는 LFA 커버리지 밖이라 검증 자체가 불가였다. 그 사이 당첨 슬립 하나가
 * 63시간 얼었다. 기록 전체에 betman 오결과 사례가 없다.
 *
 * 운영자: "waive 처리는 없어야 해. 결과가 다르게 나온 것 같다는 것만 어드민에서 표시만
 * 해주는 거지, 일치해야만 통과는 말이 안 돼."
 *
 * 그래서 이 판정은 **정산에 영향을 주지 않는다.** 지급 기준은 betman 이다. 여기서 나온
 * mismatch 는 어드민 빨간불 + 디스코드 알림이고, 진짜면 사람이 사후에 정정한다.
 *
 * ⚠️ Supabase 를 끌어오지 않는 **순수 모듈** — env 없이 테스트가 돈다.
 *
 * ## 판정표
 *   match     LFA(산 피드)와 betman 스코어 일치
 *   mismatch  두 출처가 다르다 — 어드민 표시 + 알림. 다음 실행에서 재검한다
 *   pending   LFA 로 확인할 수 없다 (색인에 없음 / 종료 전 / 스코어 없음). 커버리지 밖
 *             리그는 영원히 pending 이고 그게 정상이다 — "모른다"를 "틀렸다"로 읽지 말 것
 *
 * `waived` 는 폐지했다. DB CHECK 제약엔 옛 값으로 남아 있고 과거 행이 들고 있을 뿐,
 * 새로 만들지 않는다. 시한도 없다 — 유예할 정산이 없으니 유예할 이유도 없다.
 */

export type CheckVerdict = "match" | "mismatch" | "pending"

export interface ScorePairInput {
  home: number | null
  away: number | null
}

/** LFA 쪽 증거 — match_details_cache 행이든 일별 색인 항목이든 같은 모양 */
export interface LfaEvidence {
  finished: boolean
  homeScore: number | null
  awayScore: number | null
}

export interface VerdictInput {
  /** 베트맨 확정값 (completed 후의 betman_games.home_score/away_score — 지급 기준) */
  betman: ScorePairInput
  /**
   * 와이즈토토 보존값 — **경기 종료 후 캡처분만** 넘길 것 (킥오프+105분 이전 캡처는
   * 미완 스코어라 호출부가 null 로 걸러야 한다). 커버리지 밖/보존 이전 데이터면 null.
   * (2026-09-02 기준 와이즈토토 동기화는 7일간 0건을 써서 사실상 항상 null 이다.)
   */
  wisetoto?: ScorePairInput | null
  /** 산 피드 증거 — 없으면 null */
  lfa: LfaEvidence | null
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
 * 스코어만 검증하면 **정산이 실제로 읽는 값이 검증 밖**이다. 검증된 스코어에서 그 행의
 * 마켓 규칙(승무패/핸디캡/언더오버…)으로 result 를 재계산해 저장값과 대조한다.
 * 어긋나면 크롤 버그·경기 매핑 오류·수동 입력 실수다 — 표시하고 사람이 본다.
 *
 * 판단 불가는 통과시킨다:
 *  · 저장 result 가 비어 있으면 — 정산 가드가 어차피 그 행을 안 정산한다
 *  · 재계산이 "" 이면 (언더오버 line 0 등) — 규칙상 유도 불가
 *  · cancelled 는 스코어와 무관한 상태 결정
 *
 * ⚠️ 재계산기(deriveResultFromScore)에 마켓 유형 분기가 빠지면 여기서 가짜 불일치가
 *    쏟아진다 — 소수핸디캡이 그랬다(2026-09-02). 새 마켓 유형이 생기면 그쪽부터 볼 것.
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
 *   베트맨 != 와이즈토토, LFA 부재    → mismatch — 국내 두 출처 불일치·심판 부재
 *   와이즈토토 부재                 → 기존 2자(베트맨↔LFA) 판정으로 폴백
 *
 * 어느 갈래든 결과는 표시·알림이지 정산이 아니다.
 */
export function decideVerdict(input: VerdictInput): VerdictResult {
  const betmanScore = pair(input.betman.home, input.betman.away)
  const wisetotoScore = input.wisetoto ? pair(input.wisetoto.home, input.wisetoto.away) : null
  const lfaScore = input.lfa ? pair(input.lfa.homeScore, input.lfa.awayScore) : null
  const lfaUsable = !!input.lfa && input.lfa.finished && lfaScore != null
  const base = { betmanScore, wisetotoScore, lfaScore }

  // 베트맨(지급 기준) 스코어가 아직 비었으면 비교 자체가 불가
  if (betmanScore == null) {
    return { verdict: "pending", ...base, note: null }
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

  // ── 와이즈토토 부재 (사실상 항상) — 2자 판정 ──
  if (!lfaUsable) {
    return { verdict: "pending", ...base, note: null }
  }
  return {
    verdict: betmanScore === lfaScore ? "match" : "mismatch",
    ...base,
    note: betmanScore === lfaScore ? null : "스코어 불일치 (베트맨 vs LFA)",
  }
}
