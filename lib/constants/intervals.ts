/**
 * 폴링 및 SWR 관련 시간 상수 (ms)
 *
 * 매직 넘버를 중앙에서 관리하여 일관성 유지.
 * 변경 시 한 곳만 수정하면 됨.
 */

/** SWR dedupingInterval 기본값 */
export const SWR_DEDUP_SHORT = 5_000 // 5초 — 피드 등 자주 변하는 데이터
export const SWR_DEDUP_DEFAULT = 30_000 // 30초 — 프로필, 잔액 등
export const SWR_DEDUP_LONG = 60_000 // 1분 — 차단 목록, 공지 등

/** SWR refreshInterval */
export const NOTIFICATION_POLL_INTERVAL = 10_000 // 10초 — 알림 개수 확인
export const BETTING_REFRESH_INTERVAL = 5 * 60_000 // 5분 — 배팅 경기 목록

/** setInterval / setTimeout */
export const CHEER_BATTLE_POLL_INTERVAL = 10_000 // 10초 — 응원 배틀 실시간 갱신
export const CLOCK_UPDATE_INTERVAL = 30_000 // 30초 — 현재 시간 갱신
export const PUSH_NOTIFICATION_AUTO_CLOSE = 5_000 // 5초 — 브라우저 알림 자동 닫기
