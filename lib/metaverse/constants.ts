/**
 * 메타버스 공용 상수.
 *
 * 좌표계 주의:
 * - DB(team_map_pins, metaverse_world_plots)는 0~100 정규화 좌표
 * - Phaser 월드는 픽셀 좌표 (WORLD_WIDTH × WORLD_HEIGHT)
 * - 변환: pxX = pinX * (WORLD_WIDTH / 100)
 */

export const METAVERSE = {
  // Phaser 월드 사이즈 — eng.png (1122×1402) 와 일치 (영국 본섬 픽셀아트 지도, 사용자 신규 자산)
  WORLD_WIDTH: 1122,
  WORLD_HEIGHT: 1402,

  // 타일
  TILE_SIZE: 16,

  // 플레이어
  PLAYER_SIZE: 32,
  PLAYER_SPEED: 180, // px/s
  PLAYER_NAMETAG_OFFSET_Y: -26,

  // 말풍선
  BUBBLE_MAX_CHARS: 40,
  BUBBLE_DURATION_MS: 5000,
  BUBBLE_COOLDOWN_MS: 2000,
  BUBBLE_PROXIMITY_PX: 400,

  // 위치 동기화
  POSITION_THROTTLE_MS: 200,
  // presence 채널 구독 타임아웃 — realtime 무응답 시 부팅 hang 방지 (싱글플레이 폴백)
  PRESENCE_SUBSCRIBE_TIMEOUT_MS: 4000,

  // 광장 Plot 타일 기반 크기 (DB width_units × TILE_SIZE)
  DEFAULT_PLOT_WIDTH_PX: 6 * 16, // 96
  DEFAULT_PLOT_HEIGHT_PX: 6 * 16,

  // Realtime 채널 prefix
  CHANNEL_WORLD: "metaverse:world",
  CHANNEL_CHAT_ROOM_PREFIX: "metaverse:chat:",
  CHANNEL_STADIUM_PREFIX: "metaverse:stadium:",
  // 사이드스크롤러 글로벌 방 — 누구나 들어가면 같이 보임. 추후 실제 방별로 확장 가능.
  CHANNEL_SIDESCROLL: "metaverse:sidescroll:default",
  // 팬 라운지 (정식 채팅방, Clerk 로그인 전용) — 데모 방과 분리된 채널.
  // 'metaverse:' prefix 유지 필수 — realtime.messages RLS 가 이 prefix 로 허용.
  CHANNEL_LOUNGE: "metaverse:lounge:main",
  // Indoor presence (highbury 등 사이드뷰 실내 맵). 채팅은 RoomChannel(metaverse:chat:highbury)이 별도 처리.
  CHANNEL_INDOOR_HIGHBURY: "metaverse:indoor:highbury",

  // 색상 (placeholder — 에셋 교체 시 제거)
  COLOR_BG: 0x1a1f2e, // 야간 다크 블루 (placeholder UK 맵 배경)
  COLOR_LAND: 0x2e3a2a, // 녹지 placeholder
  COLOR_WATER: 0x15243a, // 바다 placeholder
  COLOR_PLAYER_SELF: 0x6cabdd, // 자신
  COLOR_PLAYER_OTHER: 0xaaaaaa, // 원격 유저
} as const

/**
 * dev 게스트 진입에 쓰이는 커스텀 HTTP 헤더 키.
 *
 * `lib/metaverse/auth.ts` 는 `@clerk/nextjs/server` 를 import 하는 server-only
 * 모듈이라, 클라이언트 컴포넌트에서 이 헤더 키만 필요할 때 auth.ts 를 통으로
 * import 하면 번들러가 server-only 를 끌고 와서 빌드 실패. 이 상수를 쓰면
 * 피함.
 */
export const METAVERSE_GUEST_HEADER = "x-metaverse-guest-id"

/** 0~100 정규화 → 월드 픽셀 변환 */
export function pinToWorldX(pinX: number): number {
  return (pinX / 100) * METAVERSE.WORLD_WIDTH
}

export function pinToWorldY(pinY: number): number {
  return (pinY / 100) * METAVERSE.WORLD_HEIGHT
}

/** 월드 픽셀 → 0~100 정규화 변환 (디버그/저장용) */
export function worldToPinX(worldX: number): number {
  return (worldX / METAVERSE.WORLD_WIDTH) * 100
}

export function worldToPinY(worldY: number): number {
  return (worldY / METAVERSE.WORLD_HEIGHT) * 100
}
