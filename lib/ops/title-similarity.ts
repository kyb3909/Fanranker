/**
 * 발행 후 중복 의심쌍 탐지용 제목 유사도 (invariant-audit).
 *
 * 발행 전 게이트(titleSimilarity, 토큰 자카드)는 3자 미만 토큰을 버려 한국어 2음절
 * 단어(첼시·대폭·축소·계획…)가 전부 증발한다 — 실측 2026-08-07: "첼시 41인 축소"
 * 재탕 쌍이 0.2 로 게이트(0.5)를 통과해 같은 run 에서 2건 발행됨. 여기는 문자
 * 바이그램 Dice 로 계산해 짧은 한국어 단어도 신호가 된다.
 *
 * 발행을 막는 게 아니라 사람에게 의심쌍을 보여주는 용도라, 오탐(전개 중인 같은
 * 사가의 후속 기사)이 좀 섞여도 무해하다 — 임계값은 테스트의 실사고 쌍으로 고정.
 * ⚠️ 실측: 정상 후속 기사(로드리 0.57)가 진짜 중복(0.49~0.52)보다 높다 — 임계값으로
 * 정상/중복을 가를 수 없으므로 이 값은 "사람이 볼 후보의 하한"일 뿐이다.
 */

/** 신규 중복 의심 판정 하한 — __tests__/lib/ops/title-similarity.test.ts 로 캘리브레이션 */
export const DUP_SUSPECT_MIN = 0.45

function normalizeTitle(title: string): string {
  return title
    .replace(/^\[[^\]]*\]\s*/, "") // [매체] 접두 제거
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
}

function bigrams(s: string): Map<string, number> {
  const grams = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  return grams
}

/** 문자 바이그램 Dice 계수 (0~1) */
export function bigramTitleSimilarity(a: string, b: string): number {
  const ga = bigrams(normalizeTitle(a))
  const gb = bigrams(normalizeTitle(b))
  let sizeA = 0
  let sizeB = 0
  let inter = 0
  for (const n of ga.values()) sizeA += n
  for (const n of gb.values()) sizeB += n
  if (sizeA === 0 || sizeB === 0) return 0
  for (const [g, n] of ga) {
    const m = gb.get(g)
    if (m) inter += Math.min(n, m)
  }
  return (2 * inter) / (sizeA + sizeB)
}
