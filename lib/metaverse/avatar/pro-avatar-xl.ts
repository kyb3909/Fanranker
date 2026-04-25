/**
 * Pro Avatar XL — 사이드뷰 전용 8방향 rotation + east/west 2방향 idle/walk/jump/kick.
 *
 * 에셋 레이아웃 (프리셋별로 `/metaverse/avatars/<preset-id>/` 아래에 동일 구조):
 *   - rotations/{south|...|north-west}.webp   — 8방향 idle
 *   - walk/{east|west}/frame_{000-NNN}.webp   — 걷기 프레임
 *   - jump/{east|west}/frame_{000-NNN}.webp   — 점프 원샷
 *   - kick/{east|west}/frame_{000-NNN}.webp   — 축구 킥 원샷
 *
 * side-scroller 는 가로 이동만 하므로 walk/jump/kick 는 east/west 만 생성 (north/south 는 flip
 * 대상이 없음 — turn 전용 정면/후면은 rotations 이미지로 idle 표시).
 *
 * 프리셋(= skin/uniform 변형) 는 `./presets.ts` 의 `AVATAR_PRESETS` 참조. 이 파일은 preset 을
 * 받아 Phaser texture 키·애니 키를 일관된 규칙으로 생성·등록한다.
 */

import type * as Phaser from "phaser"
import { AVATAR_PRESETS, DEFAULT_AVATAR_KEY, getAvatarPreset, type AvatarPreset } from "./presets"

export type Facing = "east" | "west"
export const FACINGS: readonly Facing[] = ["east", "west"] as const

/**
 * 8방향 정적 rotation. idle 상태에서 캐릭터가 바라보는 방향을 표현할 때 사용.
 * 걷기/점프/킥 애니메이션은 east/west 2방향만 생성돼있어 가로 이동에만 유효.
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

/** 한 프레임 당 turn 지속 시간 — 8프레임 total ≈ 150ms 빠른 회전. */
export const TURN_FRAME_MS = 30

type Kind = "walk" | "jump" | "kick"

function frameCountOf(preset: AvatarPreset, kind: Kind): number {
  switch (kind) {
    case "walk":
      return preset.walkFrames
    case "jump":
      return preset.jumpFrames
    case "kick":
      return preset.kickFrames
  }
}

function fpsOf(preset: AvatarPreset, kind: Kind): number {
  switch (kind) {
    case "walk":
      return preset.walkFps
    case "jump":
      return preset.jumpFps
    case "kick":
      return preset.kickFps
  }
}

/** rotation 텍스처 키 — 8방향 idle 공용. */
export function texKeyRotation(dir: RotationDir, presetKey?: string): string {
  const preset = getAvatarPreset(presetKey)
  return `${preset.texturePrefix}-rot-${dir}`
}

/** idle east/west — rotation 키와 동일 이미지 공유 (하위 호환). */
export function texKeyIdle(f: Facing, presetKey?: string): string {
  return texKeyRotation(f, presetKey)
}

/** 애니 프레임 텍스처 키. */
export function texKeyAnim(kind: Kind, f: Facing, frame: number, presetKey?: string): string {
  const preset = getAvatarPreset(presetKey)
  return `${preset.texturePrefix}-${kind}-${f}-${frame}`
}

/** Phaser 애니 키 (`play(key)` 용). */
export function animKey(kind: Kind, f: Facing, presetKey?: string): string {
  const preset = getAvatarPreset(presetKey)
  return `${preset.texturePrefix}-${kind}:${f}`
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

/** 지정 프리셋 하나만 preload. */
export function preloadAvatarPreset(scene: Phaser.Scene, presetKey: string): void {
  const preset = getAvatarPreset(presetKey)
  for (const dir of ROTATIONS) {
    const key = texKeyRotation(dir, preset.id)
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `${preset.assetBase}/rotations/${dir}.webp`)
    }
  }
  for (const f of FACINGS) {
    for (const kind of ["walk", "jump", "kick"] as Kind[]) {
      const frames = frameCountOf(preset, kind)
      for (let i = 0; i < frames; i++) {
        const key = texKeyAnim(kind, f, i, preset.id)
        if (!scene.textures.exists(key)) {
          const padded = String(i).padStart(3, "0")
          scene.load.image(key, `${preset.assetBase}/${kind}/${f}/frame_${padded}.webp`)
        }
      }
    }
  }
}

/** 등록된 모든 프리셋 preload — 원격 유저의 다양한 외형 지원용. */
export function preloadAllAvatarPresets(scene: Phaser.Scene): void {
  for (const id of Object.keys(AVATAR_PRESETS)) {
    preloadAvatarPreset(scene, id)
  }
}

/** 지정 프리셋의 Phaser anim 등록. 키가 이미 있으면 skip. */
export function createAvatarAnimations(scene: Phaser.Scene, presetKey: string): void {
  const preset = getAvatarPreset(presetKey)
  const defs: Array<{ kind: Kind; repeat: number }> = [
    { kind: "walk", repeat: -1 },
    { kind: "jump", repeat: 0 },
    { kind: "kick", repeat: 0 },
  ]
  for (const f of FACINGS) {
    for (const { kind, repeat } of defs) {
      const key = animKey(kind, f, preset.id)
      if (scene.anims.exists(key)) continue
      const frameCount = frameCountOf(preset, kind)
      const frames = Array.from({ length: frameCount }, (_, i) => ({
        key: texKeyAnim(kind, f, i, preset.id),
      }))
      scene.anims.create({ key, frames, frameRate: fpsOf(preset, kind), repeat })
    }
  }
}

export function createAllAvatarAnimations(scene: Phaser.Scene): void {
  for (const id of Object.keys(AVATAR_PRESETS)) {
    createAvatarAnimations(scene, id)
  }
}

// ============================================================
// 하위 호환 — 기존 호출자 (default preset) 를 위한 alias.
// ============================================================

/** @deprecated — preset 명시 버전 사용 권장 (`preloadAvatarPreset`). 기본 프리셋 한정. */
export function preloadProAvatarXl(scene: Phaser.Scene): void {
  preloadAvatarPreset(scene, DEFAULT_AVATAR_KEY)
}

/** @deprecated — preset 명시 버전 사용 권장 (`createAvatarAnimations`). 기본 프리셋 한정. */
export function createProAvatarXlAnimations(scene: Phaser.Scene): void {
  createAvatarAnimations(scene, DEFAULT_AVATAR_KEY)
}

/** 기본 프리셋 상수 — 기존 `AVATAR_PRO_XL.FRAME_HEIGHT` 사용처용. */
export const AVATAR_PRO_XL = {
  get FRAME_WIDTH() {
    return AVATAR_PRESETS[DEFAULT_AVATAR_KEY].frameWidth
  },
  get FRAME_HEIGHT() {
    return AVATAR_PRESETS[DEFAULT_AVATAR_KEY].frameHeight
  },
  get TEXTURE_PREFIX() {
    return AVATAR_PRESETS[DEFAULT_AVATAR_KEY].texturePrefix
  },
  get ASSET_BASE() {
    return AVATAR_PRESETS[DEFAULT_AVATAR_KEY].assetBase
  },
} as const
