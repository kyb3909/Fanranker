/**
 * Default Avatar Pro XL (208×208) — 사이드뷰 전용. idle/walk/jump/kick 지원.
 *
 * 에셋: public/metaverse/avatars/default-pro-xl/
 *   - rotations/{east,west}.png           — idle
 *   - walk/{east,west}/frame_{000-003}.png — walk 4프레임
 *   - jump/{east,west}/frame_{000-006}.png — two-footed-jump 7프레임 (원샷)
 *   - kick/{east,west}/frame_{000-003}.png — soccer kick 4프레임 (원샷)
 *     * kick 프레임에는 축구공이 이미 그려져 있어 별도 공 스프라이트 없이도 시각 성립.
 *
 * side-scroller 는 2방향 (east/west) 만 — 월드맵 8방향 버전 (`pro-avatar.ts`) 과 별도.
 */

import type * as Phaser from "phaser"

export type Facing = "east" | "west"
export const FACINGS: readonly Facing[] = ["east", "west"] as const

/**
 * 8방향 정적 rotation. idle 상태에서 캐릭터가 바라보는 방향을 표현할 때 사용.
 * 걷기/점프/킥 애니메이션은 여전히 east/west 2방향만 생성돼있어 가로 이동에만 유효.
 *
 * 배열 순서는 시계방향 (south 부터) — `rotationPath` 에서 최단 경로 계산에 쓰임.
 */
export const ROTATIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const
export type RotationDir = (typeof ROTATIONS)[number]

/** 한 프레임 당 렌더 지속 시간 — 150ms 전체 turn 을 위해 짧게. */
export const TURN_FRAME_MS = 30

export const AVATAR_PRO_XL = {
  FRAME_WIDTH: 208,
  FRAME_HEIGHT: 208,
  WALK_FRAMES: 4,
  JUMP_FRAMES: 7,
  KICK_FRAMES: 4,
  HEADBUTT_FRAMES: 4, // PixelLab 커스텀 예상 프레임 수
  STUMBLE_FRAMES: 7, // falling-back-death 템플릿 (실측 7프레임)
  GETUP_FRAMES: 5, // getting-up 템플릿 (실측 5프레임)
  WALK_FPS: 10, // 8 → 10 — WALK_SPEED 상승 (240→300) 에 맞춰 발놀림도 비례 상향해 슬라이딩 방지
  JUMP_FPS: 10, // 7프레임 × 100ms = 700ms (v=-320, g=900 에서 airtime ≈ 710ms 와 자연스레 매칭)
  KICK_FPS: 12, // 4프레임 × ~83ms = 333ms — 짧고 단호한 액션
  HEADBUTT_FPS: 10, // 4프레임 × 100ms = 400ms
  STUMBLE_FPS: 8, // 넘어지는 건 약간 느릿 (~875ms)
  GETUP_FPS: 8,
  TEXTURE_PREFIX: "avatar-pro-xl",
  ASSET_BASE: "/metaverse/avatars/default-pro-xl",
} as const

const KIND_FRAMES = {
  walk: AVATAR_PRO_XL.WALK_FRAMES,
  jump: AVATAR_PRO_XL.JUMP_FRAMES,
  kick: AVATAR_PRO_XL.KICK_FRAMES,
  headbutt: AVATAR_PRO_XL.HEADBUTT_FRAMES,
  stumble: AVATAR_PRO_XL.STUMBLE_FRAMES,
  getup: AVATAR_PRO_XL.GETUP_FRAMES,
} as const

type Kind = keyof typeof KIND_FRAMES

/** 모든 8방향 rotation 에 공용. east/west 는 기존 idle 키와 동일 이미지 공유. */
export function texKeyRotation(dir: RotationDir): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-rot-${dir}`
}

/** 하위 호환 — 기존 호출자들이 idle east/west 만 쓸 때. 내부는 rotation 키로 통합. */
export function texKeyIdle(f: Facing): string {
  return texKeyRotation(f)
}

/**
 * from → to 까지 최단 cyclic path (to 포함, from 제외). 같으면 빈 배열.
 * 시계/반시계 중 짧은 쪽 선택. tie 시 시계 방향.
 */
export function rotationPath(from: RotationDir, to: RotationDir): RotationDir[] {
  if (from === to) return []
  const fromIdx = ROTATIONS.indexOf(from)
  const toIdx = ROTATIONS.indexOf(to)
  const cwDelta = (toIdx - fromIdx + 8) % 8
  const ccwDelta = (fromIdx - toIdx + 8) % 8
  const useCw = cwDelta <= ccwDelta
  const delta = useCw ? cwDelta : ccwDelta
  const path: RotationDir[] = []
  for (let i = 1; i <= delta; i++) {
    const idx = useCw ? (fromIdx + i) % 8 : (fromIdx - i + 8) % 8
    path.push(ROTATIONS[idx])
  }
  return path
}

export function texKeyAnim(kind: Kind, f: Facing, frame: number): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-${kind}-${f}-${frame}`
}

export function animKey(kind: Kind, f: Facing): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-${kind}:${f}`
}

export function preloadProAvatarXl(scene: Phaser.Scene): void {
  const base = AVATAR_PRO_XL.ASSET_BASE
  // 8방향 rotation — 정면/후면 포함 (턴 애니에 필수)
  for (const dir of ROTATIONS) {
    const key = texKeyRotation(dir)
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `${base}/rotations/${dir}.png`)
    }
  }
  // walk/jump/kick — east/west 만 (2방향 애니만 생성돼있음)
  for (const f of FACINGS) {
    for (const kind of Object.keys(KIND_FRAMES) as Kind[]) {
      for (let i = 0; i < KIND_FRAMES[kind]; i++) {
        const key = texKeyAnim(kind, f, i)
        if (!scene.textures.exists(key)) {
          const padded = String(i).padStart(3, "0")
          scene.load.image(key, `${base}/${kind}/${f}/frame_${padded}.png`)
        }
      }
    }
  }
}

export function createProAvatarXlAnimations(scene: Phaser.Scene): void {
  const defs: Array<{ kind: Kind; fps: number; repeat: number }> = [
    { kind: "walk", fps: AVATAR_PRO_XL.WALK_FPS, repeat: -1 },
    { kind: "jump", fps: AVATAR_PRO_XL.JUMP_FPS, repeat: 0 },
    { kind: "kick", fps: AVATAR_PRO_XL.KICK_FPS, repeat: 0 },
    { kind: "headbutt", fps: AVATAR_PRO_XL.HEADBUTT_FPS, repeat: 0 },
    { kind: "stumble", fps: AVATAR_PRO_XL.STUMBLE_FPS, repeat: 0 },
    { kind: "getup", fps: AVATAR_PRO_XL.GETUP_FPS, repeat: 0 },
  ]
  for (const f of FACINGS) {
    for (const { kind, fps, repeat } of defs) {
      const key = animKey(kind, f)
      if (scene.anims.exists(key)) continue
      // 모든 프레임 텍스처가 로드됐는지 확인 — 아직 에셋 없으면 anim 생성 skip (console warn 방지)
      const frames = Array.from({ length: KIND_FRAMES[kind] }, (_, i) => ({
        key: texKeyAnim(kind, f, i),
      }))
      const allLoaded = frames.every((f) => scene.textures.exists(f.key))
      if (!allLoaded) continue
      scene.anims.create({ key, frames, frameRate: fps, repeat })
    }
  }
}
