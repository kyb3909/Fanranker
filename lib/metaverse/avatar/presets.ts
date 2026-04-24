/**
 * 아바타 프리셋 레지스트리 — MMORPG 식 prefab 캐릭터 변형.
 *
 * 각 프리셋은 독립된 스프라이트 세트 (rotations + walk/jump/kick) 를 `public/metaverse/avatars/<id>/`
 * 아래에 가지고 있음. Phaser 텍스처 키에는 prefix 를 달아 서로 충돌하지 않게 함.
 *
 * 새 유니폼/외형을 추가할 때:
 *  1. PixelLab `create_character` mode=pro side view 로 생성
 *  2. `animate_character` 로 walk / jump / (custom) kick 애니 각각 큐
 *  3. ZIP 다운로드 후 `public/metaverse/avatars/<id>/` 로 프레임 배치
 *  4. 이 파일 `AVATAR_PRESETS` 에 항목 추가
 *  5. 필요 시 hitbox (`bodyWidth/Height/OffsetX/OffsetY`) 를 캐릭터 픽셀 경계에 맞게 조정
 */

export interface AvatarPreset {
  /** 저장/전송용 안정 키 (프리셋 변경 시 그대로 유지). */
  id: string
  /** UI 표시용 라벨 */
  label: string
  /** Phaser 텍스처 키 prefix — preset 간 충돌 방지용. */
  texturePrefix: string
  /** 에셋 루트 — `public/` 기준 절대 URL */
  assetBase: string
  /** 개별 프레임 PNG 의 폭·높이 */
  frameWidth: number
  frameHeight: number
  /** 애니 프레임 수 */
  walkFrames: number
  jumpFrames: number
  kickFrames: number
  /** Phaser anim FPS */
  walkFps: number
  jumpFps: number
  kickFps: number
  /** 물리 hitbox — 프레임 내부에서 실제 캐릭터 픽셀이 차지하는 영역 */
  bodyWidth: number
  bodyHeight: number
  bodyOffsetX: number
  bodyOffsetY: number
  /**
   * Kick 애니 재생 중에만 곱해지는 보조 스케일. PixelLab 커스텀 킥 애니가 idle 대비 과하게
   * 크게 그려지는 경우 (Arsenal 처럼) 에 1 미만으로 설정해 시각적 "갑자기 커짐" 을 보정.
   * 기본은 1.0 (보정 없음). 해당 프리셋 kick 프레임의 실제 최대 height / idle height 비율로 역산.
   */
  kickScale?: number
}

export const DEFAULT_AVATAR_KEY = "default-pro-xl" as const
export const ARSENAL_HOME_AVATAR_KEY = "arsenal-home" as const

export const AVATAR_PRESETS: Record<string, AvatarPreset> = {
  [DEFAULT_AVATAR_KEY]: {
    id: DEFAULT_AVATAR_KEY,
    label: "기본",
    texturePrefix: "avatar-pro-xl",
    assetBase: "/metaverse/avatars/default-pro-xl",
    frameWidth: 208,
    frameHeight: 208,
    walkFrames: 4,
    jumpFrames: 7,
    kickFrames: 4,
    // WALK_SPEED 상승 (240→300) 에 맞춘 발놀림 FPS. 점프 7프 × 100ms = 700ms 이 airtime 과 매칭.
    walkFps: 10,
    jumpFps: 10,
    kickFps: 12,
    bodyWidth: 34,
    bodyHeight: 98,
    bodyOffsetX: 86,
    bodyOffsetY: 60,
  },
  [ARSENAL_HOME_AVATAR_KEY]: {
    id: ARSENAL_HOME_AVATAR_KEY,
    label: "빨강 유니폼 (홈)",
    texturePrefix: "avatar-arsenal-home",
    assetBase: "/metaverse/avatars/arsenal-home",
    // PixelLab pro size=128 → canvas 208×208 (기본과 동일).
    frameWidth: 208,
    frameHeight: 208,
    walkFrames: 4,
    jumpFrames: 7,
    kickFrames: 4,
    walkFps: 10,
    jumpFps: 10,
    kickFps: 12,
    // 실측 east.png: bbox (87, 61) - (119, 160). 기본 프리셋과 ±2px 내 거의 동일.
    bodyWidth: 32,
    bodyHeight: 99,
    bodyOffsetX: 87,
    bodyOffsetY: 61,
    // 커스텀 kick 애니 실측: max frame height 156px (idle 99px 대비 +57%).
    // 0.65 로 스케일 다운 시 kick feet y 가 idle 과 거의 일치 + 크기도 비슷해져 전환이 자연스러움.
    kickScale: 0.65,
  },
}

export function getAvatarPreset(key: string | undefined | null): AvatarPreset {
  if (key && AVATAR_PRESETS[key]) return AVATAR_PRESETS[key]
  return AVATAR_PRESETS[DEFAULT_AVATAR_KEY]
}

export function listAvatarPresets(): AvatarPreset[] {
  return Object.values(AVATAR_PRESETS)
}
