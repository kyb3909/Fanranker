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

export const AVATAR_PRO_XL = {
  FRAME_WIDTH: 208,
  FRAME_HEIGHT: 208,
  WALK_FRAMES: 4,
  JUMP_FRAMES: 7,
  KICK_FRAMES: 4,
  WALK_FPS: 8,
  JUMP_FPS: 10, // 7프레임 × 100ms = 700ms (v=-320, g=900 에서 airtime ≈ 710ms 와 자연스레 매칭)
  KICK_FPS: 12, // 4프레임 × ~83ms = 333ms — 짧고 단호한 액션
  TEXTURE_PREFIX: "avatar-pro-xl",
  ASSET_BASE: "/metaverse/avatars/default-pro-xl",
} as const

const KIND_FRAMES = {
  walk: AVATAR_PRO_XL.WALK_FRAMES,
  jump: AVATAR_PRO_XL.JUMP_FRAMES,
  kick: AVATAR_PRO_XL.KICK_FRAMES,
} as const

type Kind = keyof typeof KIND_FRAMES

export function texKeyIdle(f: Facing): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-idle-${f}`
}

export function texKeyAnim(kind: Kind, f: Facing, frame: number): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-${kind}-${f}-${frame}`
}

export function animKey(kind: Kind, f: Facing): string {
  return `${AVATAR_PRO_XL.TEXTURE_PREFIX}-${kind}:${f}`
}

export function preloadProAvatarXl(scene: Phaser.Scene): void {
  const base = AVATAR_PRO_XL.ASSET_BASE
  for (const f of FACINGS) {
    const idleKey = texKeyIdle(f)
    if (!scene.textures.exists(idleKey)) {
      scene.load.image(idleKey, `${base}/rotations/${f}.png`)
    }
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
  ]
  for (const f of FACINGS) {
    for (const { kind, fps, repeat } of defs) {
      const key = animKey(kind, f)
      if (scene.anims.exists(key)) continue
      scene.anims.create({
        key,
        frames: Array.from({ length: KIND_FRAMES[kind] }, (_, i) => ({
          key: texKeyAnim(kind, f, i),
        })),
        frameRate: fps,
        repeat,
      })
    }
  }
}
