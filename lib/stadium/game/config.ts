/**
 * Phaser 게임 전역 상수
 *
 * 실제 GameConfig 객체는 GameCanvas 래퍼(클라이언트 전용)에서 Phaser를 import한 뒤
 * createGameConfig()로 생성한다. 이 모듈은 SSR 안전하도록 Phaser에 의존하지 않음.
 */

export const GAME_WIDTH = 800
export const GAME_HEIGHT = 600

/** 픽셀아트 스타일 기본 색상 */
export const GAME_BG_COLOR = "#1a1a2e"

/** 카메라 드래그 민감도 */
export const CAMERA_DRAG_SENSITIVITY = 1.0

/** Realtime 위치 브로드캐스트 throttle (ms) */
export const POSITION_BROADCAST_THROTTLE_MS = 100

/** 경기장 건설 단계 임계값 (points) */
export const STADIUM_STAGE_THRESHOLDS = [
  0, // stage 0: 빈 땅
  500, // stage 1: 기초
  1500, // stage 2: 철골
  3000, // stage 3: 스탠드 1
  5000, // stage 4: 지붕 골조
  7500, // stage 5: 좌석
  10000, // stage 6: 잔디
  13000, // stage 7: 조명
  16000, // stage 8: 간판
  20000, // stage 9: 완공
] as const

export function pointsToStage(points: number): number {
  for (let i = STADIUM_STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= STADIUM_STAGE_THRESHOLDS[i]) return i
  }
  return 0
}
