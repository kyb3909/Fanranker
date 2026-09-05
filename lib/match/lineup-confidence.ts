/**
 * 라인업이 **예상인가 확정인가** (2026-08-25 외부 감사 지적).
 *
 * ## 왜 필요한가
 * 매치센터 라인업 탭은 선발 11명을 아무 단서 없이 보여줬다. 축구 팬에게 이건 치명적이다 —
 * 예상 라인업과 확정 라인업은 **완전히 다른 정보**이고, 둘을 구분 못 하면 라인업 자체가
 * 쓸모없어진다. 심하면 데이터 전체를 안 믿게 된다.
 *
 * 실측(발렌시아 vs 레알 베티스, 2026-08-25): `fetchedAt` 이 킥오프 **21.99시간 전**이었다.
 * 공식 발표는 킥오프 ~1시간 전이므로 그건 확정일 수가 없다. 그런데 화면은 확정처럼 보였다.
 *
 * ## 판정 기준 = 피드의 projected 플래그 우선, 옛 저장분만 받아온 시각으로 추정
 * 새 LFA 응답은 명시적인 예상 여부를 보존한다. 플래그가 없는 옛 저장분은 시각으로 구분한다.
 *
 * ⚠️ `fetchedAt` 이지 `now` 가 아니다. 22시간 전에 받아 캐시한 예상 명단을 킥오프 10분 전에
 *    열어도 그건 여전히 **예상**이다 — 다시 받아오기 전까지는. 현재 시각으로 판정하면
 *    내용은 그대로인데 배지만 확정으로 바뀌는, 가장 나쁜 거짓말이 된다.
 * ⚠️ 순수 모듈이다 — Supabase 를 안 끌어온다 (day-freshness·score-gate 와 같은 이유).
 */

/** 공식 라인업 공개 시점 — 킥오프 1시간 전이 국제 관행 */
export const OFFICIAL_LINEUP_LEAD_MS = 60 * 60_000

export type LineupConfidence = "confirmed" | "predicted"

export function lineupConfidence(opts: {
  kickoff: string | null | undefined
  fetchedAt: string | null | undefined
  projected?: boolean
}): LineupConfidence {
  if (opts.projected != null) return opts.projected ? "predicted" : "confirmed"
  const ko = opts.kickoff ? Date.parse(opts.kickoff) : NaN
  const at = opts.fetchedAt ? Date.parse(opts.fetchedAt) : NaN
  // 판단 근거가 없으면 **예상으로 낮춰 잡는다** — 확정이라고 잘못 말하는 쪽이 훨씬 나쁘다
  if (!Number.isFinite(ko) || !Number.isFinite(at)) return "predicted"
  return at >= ko - OFFICIAL_LINEUP_LEAD_MS ? "confirmed" : "predicted"
}

export function lineupConfidenceLabel(c: LineupConfidence): string {
  return c === "confirmed" ? "확정 라인업" : "예상 라인업"
}
