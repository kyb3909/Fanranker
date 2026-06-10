/**
 * 매치 그룹 내 마켓 row 중복 제거.
 *
 * betman 동기화가 같은 경기를 여러 라운드에 중복 등록하면 (알려진 betman 운영
 * 패턴 — fetch-results Phase 6 backfill 의 stuck row 원인과 동일), 동일 마켓
 * row 가 라운드 수만큼 복제되어 UI 에 "승무패 ×3" 처럼 노출된다.
 *
 * 시그니처에 배당까지 포함하므로:
 * - 라운드만 다른 완전 중복(타입·핸디·라인·배당 동일) → 첫 row 만 유지
 * - 진짜 전반전 마켓(같은 타입이라도 배당이 다름) → 보존
 *   → games route 의 전반전 휴리스틱(휴리스틱 1: 동일 키 2회차 = 전반)이
 *     그대로 동작한다.
 *
 * 입력 순서(game_no asc 정렬 후 호출)를 보존하며 첫 등장 row 를 유지한다.
 */

interface MarketRowLike {
  game_type?: unknown
  handicap?: unknown
  over_under_line?: unknown
  home_win_odds?: unknown
  away_win_odds?: unknown
  draw_odds?: unknown
  over_odds?: unknown
  under_odds?: unknown
  odd_odds?: unknown
  even_odds?: unknown
}

export function marketSignature(g: MarketRowLike): string {
  const v = (x: unknown) => (x === null || x === undefined ? "x" : String(x))
  return [
    v(g.game_type),
    v(g.handicap),
    v(g.over_under_line),
    v(g.home_win_odds),
    v(g.away_win_odds),
    v(g.draw_odds),
    v(g.over_odds),
    v(g.under_odds),
    v(g.odd_odds),
    v(g.even_odds),
  ].join("|")
}

/** 동일 시그니처 row 는 첫 등장만 유지 (순서 보존). */
export function dedupeMarketRows<T extends MarketRowLike>(games: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const g of games) {
    const sig = marketSignature(g)
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(g)
  }
  return out
}
