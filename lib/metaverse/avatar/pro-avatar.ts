/**
 * Default "Avatar Pro" 스프라이트 로더 + 애니메이션 헬퍼.
 *
 * 에셋: public/metaverse/avatars/default-pro/
 *   - rotations/{8방향}.png           — idle 정지 포즈
 *   - walk/{8방향}/frame_{000-003}.png — 4프레임 walk cycle × 8방향
 *   - metadata.json                    — 원본 (참고용, 런타임은 로드 X)
 *
 * 캔버스 124×124 (투명 배경), PixelLab mannequin 템플릿 기반.
 *
 * 사용:
 *   scene.preload() → preloadProAvatar(this)
 *   scene.create()  → createProAvatarAnimations(this)
 *                     sprite = scene.physics.add.sprite(x, y, textureKeyIdle("south"))
 *                     sprite.play(animKeyWalk("east"))
 */

import type * as Phaser from "phaser"

export const DIRECTIONS_8 = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const
export type Direction8 = (typeof DIRECTIONS_8)[number]

export const AVATAR_PRO = {
  FRAME_WIDTH: 124,
  FRAME_HEIGHT: 124,
  WALK_FRAMES: 4,
  WALK_FPS: 8,
  TEXTURE_PREFIX: "avatar-pro",
  ASSET_BASE: "/metaverse/avatars/default-pro",
} as const

export function textureKeyIdle(dir: Direction8): string {
  return `${AVATAR_PRO.TEXTURE_PREFIX}-idle-${dir}`
}

export function textureKeyWalk(dir: Direction8, frame: number): string {
  return `${AVATAR_PRO.TEXTURE_PREFIX}-walk-${dir}-${frame}`
}

export function animKeyWalk(dir: Direction8): string {
  return `${AVATAR_PRO.TEXTURE_PREFIX}-walk:${dir}`
}

/** Scene preload() 에서 호출. 40장 이미지 전부 큐에 등록. */
export function preloadProAvatar(scene: Phaser.Scene): void {
  for (const dir of DIRECTIONS_8) {
    const idleKey = textureKeyIdle(dir)
    if (!scene.textures.exists(idleKey)) {
      scene.load.image(idleKey, `${AVATAR_PRO.ASSET_BASE}/rotations/${dir}.png`)
    }
    for (let i = 0; i < AVATAR_PRO.WALK_FRAMES; i++) {
      const walkKey = textureKeyWalk(dir, i)
      if (!scene.textures.exists(walkKey)) {
        const padded = String(i).padStart(3, "0")
        scene.load.image(walkKey, `${AVATAR_PRO.ASSET_BASE}/walk/${dir}/frame_${padded}.png`)
      }
    }
  }
}

/** create() 에서 preload 뒤에 호출. 8방향 walk anim 등록. */
export function createProAvatarAnimations(scene: Phaser.Scene): void {
  for (const dir of DIRECTIONS_8) {
    const key = animKeyWalk(dir)
    if (scene.anims.exists(key)) continue
    scene.anims.create({
      key,
      frames: Array.from({ length: AVATAR_PRO.WALK_FRAMES }, (_, i) => ({
        key: textureKeyWalk(dir, i),
      })),
      frameRate: AVATAR_PRO.WALK_FPS,
      repeat: -1,
    })
  }
}

/**
 * 속도 벡터 → 8방향 중 가장 가까운 것. 정지 (vx/vy 둘 다 거의 0) 시 null.
 *
 * Phaser 좌표계: +x = east(right), +y = south(down).
 */
export function direction8FromVelocity(vx: number, vy: number): Direction8 | null {
  if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) return null
  const rad = Math.atan2(vy, vx)
  let deg = (rad * 180) / Math.PI
  if (deg < 0) deg += 360
  // 0°=east, 45°=south-east, 90°=south, 135°=south-west, 180°=west,
  // 225°=north-west, 270°=north, 315°=north-east
  const idx = Math.round(deg / 45) % 8
  const ordered: Direction8[] = [
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
    "north",
    "north-east",
  ]
  return ordered[idx]
}

/** 기존 4방향 프로토콜 → 8방향 변환. */
export function direction4To8(dir4: "up" | "down" | "left" | "right"): Direction8 {
  switch (dir4) {
    case "up":
      return "north"
    case "down":
      return "south"
    case "left":
      return "west"
    case "right":
      return "east"
  }
}
