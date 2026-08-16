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

/**
 * "pro-xl" = PixelLab pro 8방향 rotation + east/west walk/jump/kick (기존 시스템).
 * "gandalf" = 9-애니 east-only 사이드뷰 (walking/idle/run/jump/bite/headbut/kick/knockback/pain).
 *             west 는 east flipX. PNG 확장자. Aseprite 직접 export.
 */
type AvatarSystem = "pro-xl" | "gandalf"

export interface AvatarPreset {
  /** 저장/전송용 안정 키 (프리셋 변경 시 그대로 유지). */
  id: string
  /** UI 표시용 라벨 */
  label: string
  /** 아바타 시스템 — 기본값 "pro-xl" */
  avatarSystem?: AvatarSystem
  /** Phaser 텍스처 키 prefix — preset 간 충돌 방지용. */
  texturePrefix: string
  /** 에셋 루트 — `public/` 기준 절대 URL */
  assetBase: string
  /** 개별 프레임 PNG 의 폭·높이 */
  frameWidth: number
  frameHeight: number
  /** 애니 프레임 수 — pro-xl 필수, gandalf 는 walkFrames=walking/jumpFrames=jump/kickFrames=kick 재사용 */
  walkFrames: number
  jumpFrames: number
  kickFrames: number
  /** Phaser anim FPS */
  walkFps: number
  jumpFps: number
  kickFps: number
  /** gandalf 전용 추가 애니 */
  idleFrames?: number
  runFrames?: number
  biteFrames?: number
  headbutFrames?: number
  knockbackFrames?: number
  painFrames?: number
  idleFps?: number
  runFps?: number
  biteFps?: number
  headbutFps?: number
  knockbackFps?: number
  painFps?: number
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

export const DEFAULT_AVATAR_KEY = "male-basic" as const
export const MALE_BASIC_AVATAR_KEY = "male-basic" as const
const FEMALE_BASIC_AVATAR_KEY = "female-basic" as const
const MALE_ARSENAL_AVATAR_KEY = "male-arsenal" as const

export const AVATAR_PRESETS: Record<string, AvatarPreset> = {
  [MALE_BASIC_AVATAR_KEY]: {
    id: MALE_BASIC_AVATAR_KEY,
    label: "남자 기본",
    avatarSystem: "gandalf",
    texturePrefix: "avatar-male-basic",
    assetBase: "/metaverse/avatars/male-basic",
    frameWidth: 128,
    frameHeight: 117,
    // walking = walkFrames, jump = jumpFrames, kick = kickFrames (재사용)
    walkFrames: 4,
    jumpFrames: 6,
    kickFrames: 6,
    walkFps: 10,
    jumpFps: 10,
    kickFps: 12,
    idleFrames: 4,
    runFrames: 4,
    biteFrames: 6,
    headbutFrames: 5,
    knockbackFrames: 5,
    painFrames: 5,
    idleFps: 6,
    runFps: 14,
    biteFps: 10,
    headbutFps: 12,
    knockbackFps: 10,
    painFps: 8,
    // 실측 기준 추정: 128×117 캔버스, 캐릭터 몸통 ~30px wide, ~88px tall, 중앙 약간 왼쪽
    bodyWidth: 30,
    bodyHeight: 88,
    bodyOffsetX: 44,
    bodyOffsetY: 22,
  },
  [MALE_ARSENAL_AVATAR_KEY]: {
    id: MALE_ARSENAL_AVATAR_KEY,
    label: "아스날 홈",
    avatarSystem: "gandalf",
    texturePrefix: "avatar-male-arsenal",
    assetBase: "/metaverse/avatars/male-arsenal",
    // male-basic 색 치환 (scripts/make-arsenal-kit.mjs) — 프레임 구성 동일
    frameWidth: 128,
    frameHeight: 117,
    walkFrames: 4,
    jumpFrames: 6,
    kickFrames: 6,
    walkFps: 10,
    jumpFps: 10,
    kickFps: 12,
    idleFrames: 4,
    runFrames: 4,
    biteFrames: 6,
    headbutFrames: 5,
    knockbackFrames: 5,
    painFrames: 5,
    idleFps: 6,
    runFps: 14,
    biteFps: 10,
    headbutFps: 12,
    knockbackFps: 10,
    painFps: 8,
    bodyWidth: 30,
    bodyHeight: 88,
    bodyOffsetX: 44,
    bodyOffsetY: 22,
  },
  [FEMALE_BASIC_AVATAR_KEY]: {
    id: FEMALE_BASIC_AVATAR_KEY,
    label: "여자 기본",
    avatarSystem: "gandalf",
    texturePrefix: "avatar-female-basic",
    assetBase: "/metaverse/avatars/female-basic",
    frameWidth: 171,
    frameHeight: 124,
    walkFrames: 4,
    jumpFrames: 6,
    kickFrames: 6,
    walkFps: 10,
    jumpFps: 10,
    kickFps: 12,
    idleFrames: 4,
    runFrames: 4,
    biteFrames: 6,
    headbutFrames: 5,
    knockbackFrames: 5,
    painFrames: 5,
    idleFps: 6,
    runFps: 14,
    biteFps: 10,
    headbutFps: 12,
    knockbackFps: 10,
    painFps: 8,
    // 171×124, 포니테일이 왼쪽으로 튀어나와 몸통은 우측에 치우침
    bodyWidth: 28,
    bodyHeight: 88,
    bodyOffsetX: 68,
    bodyOffsetY: 22,
  },
}

export function getAvatarPreset(key: string | undefined | null): AvatarPreset {
  if (key && AVATAR_PRESETS[key]) return AVATAR_PRESETS[key]
  return AVATAR_PRESETS[DEFAULT_AVATAR_KEY]
}

function listAvatarPresets(): AvatarPreset[] {
  return Object.values(AVATAR_PRESETS)
}
