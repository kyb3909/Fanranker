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
export const WORLDCUP_SCORING_STARTS_AT = "2026-06-28T08:00:00+09:00"

const SCORING_START_MS = new Date(WORLDCUP_SCORING_STARTS_AT).getTime()

/**
 * 리더보드 순위 공개 "스냅샷" 상한 (단일 출처).
 *
 * 순위를 실시간이 아니라 특정 라운드 종료 시점의 스냅샷으로만 공개한다.
 * 이 시각 **이후**에 생성된 슬립은 순위/점수 집계에서 제외 → 화면상 순위가 "이 시점까지"로 고정된다.
 * 막바지 참여 독려용: 8강 순위를 즉시 보여주지 않고, 아래 마일스톤에서만 이 값을 다음 경계로 앞당긴다.
 *
 *   1. 16강 종료 직후  → 현재값 (8강 동안 순위 고정)
 *   2. 4강 경기 시작 시 → 8강 회차 경계로 조정
 *   3. 준결승 직전      → 4강 회차 경계로 조정
 *   4. 결승 종료 후     → `null` 로 두면 상한 해제 = 전체 반영 (최종 순위 공개)
 *
 * betman 데일리 윈도우가 08:00 KST 경계이므로, 반영할 마지막 회차의 "익일 08:00"을 상한으로 둔다.
 * 현재값: 16강 마지막 베팅일이 2026-07-07(회차 끝 07-08 08:00)이고 8강이 07-08 시작 →
 * "2026-07-08T08:00:00+09:00" 이면 7/7까지(=16강) 포함, 7/8 이후(=8강) 제외.
 *
 * 8강 종료 후 공개(=8강 반영)하려면 8강 마지막 회차의 익일 08:00 으로 이 값을 앞당긴다.
 * 조정이 필요하면 이 값 한 줄만 바꾸면 리더보드가 따라간다.
 */
export const WORLDCUP_SCORING_SNAPSHOT_AT: string | null = "2026-07-08T08:00:00+09:00"

/**
 * 리더보드에 노출할 스냅샷 안내 문구 (단일 출처).
 * 마일스톤에서 `WORLDCUP_SCORING_SNAPSHOT_AT` 을 조정할 때 함께 갱신한다.
 */
export const WORLDCUP_SNAPSHOT_NOTE =
  "순위는 실시간이 아니라 라운드 종료 시점마다 공개돼요. 현재는 16강까지 반영 — 8강 순위 변동은 4강부터 공개됩니다."

/** 슬립/예측이 정식 집계 대상인지 — created_at 이 집계 시작 시점 이후인가. */
export function isWorldcupScoringSlip(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return new Date(createdAt).getTime() >= SCORING_START_MS
}
