/**
 * 확정 스코어 — **산 피드 기준 + 와이즈토토 교차검증** (2026-08-25 운영자 확정).
 *
 * ## 왜 두 출처인가
 * 리포트 스코어 게이트는 "확정 스코어"를 전제로 돈다. 그 확정이 부실하면 게이트도
 * 부실하다. 운영자 지시:
 *   1) 우리가 **돈 주고 산 피드(LFA)를 기준**으로 하고
 *   2) **와이즈토토와 교차검증**해서
 *   3) 둘이 맞을 때만 확정한다.
 *   4) 그 다음 소커웨이에 기사가 있으면 그걸 기반으로 리포트를 쓴다 (없으면 안 쓴다).
 *
 * ⚠️ 한쪽만 있으면 **확정이 아니다.** 교차검증을 안 거친 값은 이 함수의 존재 이유를
 *    지운다. 확정이 늦어지면 리포트가 늦게 나올 뿐이고, 그게 틀린 리포트보다 낫다.
 *
 * ⚠️ 둘째 출처는 `betman_games.home_score/away_score` 다 (파라미터 이름 `wisetoto` 는 역사적
 *    이름). 2026-09-02 정정: 그 칼럼을 채우는 건 **VPS betman 결과 크롤(15분)** 이다 —
 *    wisetoto 동기화는 사이트가 접근을 막아 0건이었고 같은 날 걷어냈다. 첫째 출처(LFA)는
 *    match-extras 가 우리 DB 상세 캐시에서 먼저 읽고 색인은 폴백으로만 쓴다.
 *
 * ⚠️ 순수 모듈이다. 이 판정에 테스트가 붙어 있어야 하는 이유는 아프게 배웠다 —
 *    게이트는 배포돼 있었는데 **스코어를 넘기는 배선이 끊겨** 한 번도 돌지 않았다.
 */

export interface ScoreSide {
  home: number | null
  away: number | null
}

export type ConfirmResult = { ok: true; score: string } | { ok: false; reason: string }

function pair(s: ScoreSide | null): string | null {
  if (!s || s.home == null || s.away == null) return null
  return `${s.home}-${s.away}`
}

/**
 * 두 출처가 합의한 스코어. 합의 못 하면 사유를 돌려준다(로그용).
 *
 * @param lfa      산 피드. `finished` 가 아니면 확정하지 않는다 — 진행 중 점수는 확정이 아니다.
 * @param wisetoto 교차검증용 (betman_games 칼럼에 저장돼 있다)
 */
export function confirmScore(
  lfa: (ScoreSide & { finished: boolean }) | null,
  wisetoto: ScoreSide | null
): ConfirmResult {
  if (!lfa) return { ok: false, reason: "산 피드에 이 경기가 없다" }
  if (!lfa.finished) return { ok: false, reason: "산 피드 기준 아직 종료 전" }

  const a = pair(lfa)
  if (!a) return { ok: false, reason: "산 피드에 스코어가 없다" }

  const b = pair(wisetoto)
  if (!b) return { ok: false, reason: "와이즈토토 스코어가 아직 없다 — 교차검증 불가" }

  // ⚠️ 뒤집힘은 허용하지 않는다. 여기서 정하는 건 **홈-원정 순서의 확정값**이고,
  //    리포트 제목의 뒤집힌 표기를 봐주는 건 score-gate 의 몫이다. 역할을 섞지 않는다.
  if (a !== b) return { ok: false, reason: `두 출처 불일치 — 산 피드 ${a} vs 와이즈토토 ${b}` }

  return { ok: true, score: a }
}
