/**
 * 월드컵 이벤트 정식 점수 집계 시작 시점 (단일 출처).
 *
 * 32강 토너먼트 첫 betman day 08:00 KST 기준 — 이 시점 이전(조별리그 등) 슬립은
 * 리더보드·"내 점수" 집계에서 제외한다 = "정식 집계·랭킹은 32강부터".
 *
 * betman 데일리 윈도우가 08:00 KST 경계이고, 한 슬립의 모든 경기는 같은 데일리
 * 라운드(= 같은 betman day)라, 슬립 시각(created_at)으로 betman day 단위 분리가 정확하다.
 *
 * 실제 32강 일정이 확정되면 이 값만 조정하면 리더보드와 내 점수가 함께 따라간다.
 */
export const WORLDCUP_SCORING_STARTS_AT = "2026-06-29T08:00:00+09:00"

const SCORING_START_MS = new Date(WORLDCUP_SCORING_STARTS_AT).getTime()

/** 슬립/예측이 정식 집계 대상인지 — created_at 이 집계 시작 시점 이후인가. */
export function isWorldcupScoringSlip(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return new Date(createdAt).getTime() >= SCORING_START_MS
}
