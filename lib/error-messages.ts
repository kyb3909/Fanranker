/**
 * API 응답 에러 메시지 상수
 *
 * 감사 리포트 §DX-9 해소. 한국어 통일 + 마침표 통일(있음).
 * 새 라우트는 반드시 이 상수를 쓸 것. 문자열 리터럴 직사용은 lint 규칙으로 점차 금지.
 */

export const ERR = {
  // 공통
  SERVER_ERROR: "서버 오류가 발생했습니다.",
  INVALID_BODY: "잘못된 요청 본문입니다.",
  INVALID_REQUEST: "유효하지 않은 요청입니다.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",

  // 인증/권한
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "권한이 없습니다.",
  ADMIN_REQUIRED: "관리자 권한이 필요합니다.",

  // DB fetch 실패 (500)
  FETCH_FAILED: "데이터 조회에 실패했습니다.",
  FETCH_GAMES_FAILED: "경기 목록을 가져오지 못했습니다.",
  FETCH_PREDICTIONS_FAILED: "예측 목록을 가져오지 못했습니다.",
  FETCH_USERS_FAILED: "사용자 목록을 가져오지 못했습니다.",

  // 정산 관련
  NO_SETTLEABLE_GAMES: "정산 가능한 경기가 없습니다.",
} as const

export type ErrorKey = keyof typeof ERR
