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
