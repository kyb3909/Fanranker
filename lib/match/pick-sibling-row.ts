/**
 * 형제 행 여러 개 중 **어느 것을 믿을지** — 순수 모듈 (2026-09-02).
 *
 * 라인업·상세 캐시는 game_id 단위라 같은 경기가 마켓 행 수만큼 복사돼 있을 수 있고, 복사본끼리
 * 신선도가 다르다(경기 중 스코어로 굳은 행 옆에 FT 행이 있다 — 7일 실측 8경기). 읽는 쪽이
 * 형제 행을 전부 받아 여기서 하나를 고른다. 규칙은 이미 다른 자리에서 검증된 것과 같다:
 *   · 상세: finished 가 이긴다 → 같으면 가장 최근 갱신
 *   · 라인업: ready 만 → 벤치가 많은 쪽(교체 후보 누락 사고의 교훈) → 같으면 가장 최근 갱신
 *
 * ⚠️ 여기는 "고르기"만 한다. 저장·조회는 호출부(server) 몫이다.
 */

export interface DetailsRowLike {
  finished?: unknown
  updated_at?: unknown
}

/** finished 우선, 다음 최신. 전부 비-finished 면 최신. 빈 배열이면 null */
export function pickDetailsRow<T extends DetailsRowLike>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows ?? []) {
    if (!r) continue
    if (!best) {
      best = r
      continue
    }
    const bf = best.finished === true
    const rf = r.finished === true
    if (rf !== bf) {
      if (rf) best = r
      continue
    }
    if (ts(r.updated_at) > ts(best.updated_at)) best = r
  }
  return best
}

export interface LineupRowLike {
  updated_at?: unknown
  payload?: { status?: unknown; home?: { bench?: unknown[] }; away?: { bench?: unknown[] } } | null
}

/** ready 행만 후보. 벤치 합이 큰 쪽 → 같으면 최신. 없으면 null */
export function pickLineupRow<T extends LineupRowLike>(rows: T[]): T | null {
  let best: T | null = null
  let bestBench = -1
  for (const r of rows ?? []) {
    const p = r?.payload
    if (!p || p.status !== "ready") continue
    const bench = (p.home?.bench?.length ?? 0) + (p.away?.bench?.length ?? 0)
    if (
      bench > bestBench ||
      (bench === bestBench && best && ts(r.updated_at) > ts(best.updated_at))
    ) {
      best = r
      bestBench = bench
    }
  }
  return best
}

function ts(v: unknown): number {
  const n = new Date(String(v ?? "")).getTime()
  return Number.isFinite(n) ? n : 0
}
