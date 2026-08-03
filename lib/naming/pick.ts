/**
 * 표기 승자 판정 — 순수 로직 (lib/naming/verify 의 네이버 검색량 재료를 판정).
 * "한국 언론 실사용이 정답": 압도적 다수 표기만 채택, 애매하면 사람 검수.
 */

export interface SpellingVerdict {
  /** 확정 표기 (확신 없으면 null) */
  winner: string | null
  /** 후보별 네이버 뉴스 기사 수 — 등재 근거로 사전 notes 에 남긴다 */
  counts: { candidate: string; total: number }[]
  reason: string
}

/** 채택 조건: 1위가 이 수 이상 + 2위의 3배 이상 (압도적 다수) */
const MIN_TOTAL = 30
const MIN_RATIO = 3

export function pickWinner(counts: { candidate: string; total: number }[]): SpellingVerdict {
  const sorted = [...counts].sort((a, b) => b.total - a.total)
  const top = sorted[0]
  const second = sorted[1]
  if (!top || top.total < MIN_TOTAL) {
    return { winner: null, counts: sorted, reason: "검색량 부족 — 사람 검수" }
  }
  if (second && second.total > 0 && top.total < second.total * MIN_RATIO) {
    return { winner: null, counts: sorted, reason: "표기 경합 — 사람 검수" }
  }
  return { winner: top.candidate, counts: sorted, reason: `네이버 ${top.total}건 우세` }
}
