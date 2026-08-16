/**
 * Gandalf Avatar — 9-애니 east-only 사이드뷰 시스템.
 *
 * 에셋 레이아웃 (`public/metaverse/avatars/<preset-id>/` 아래):
 *   walking/frame_{000-003}.png   — 걷기 4프레임
 *   idle/frame_{000-003}.png      — 정지 4프레임
 *   run/frame_{000-003}.png       — 달리기 4프레임
 *   jump/frame_{000-005}.png      — 점프 6프레임
 *   bite/frame_{000-005}.png      — 물기 6프레임 (Suarez)
 *   headbut/frame_{000-004}.png   — 박치기 5프레임 (Zidane)
 *   kick/frame_{000-005}.png      — 킥 6프레임
 *   knockback/frame_{000-004}.png — 피격 넉백 5프레임
 *   pain/frame_{000-004}.png      — 고통 5프레임
 *
 * west 방향은 east 텍스처를 setFlipX(true) 로 재사용. 별도 west 폴더 없음.
 */

import type * as Phaser from "phaser"
import { AVATAR_PRESETS, type AvatarPreset } from "./presets"

export type GandalfAnimKind =
  | "walking"
  | "idle"
  | "run"
  | "jump"
  | "bite"
  | "headbut"
  | "kick"
  | "knockback"
  | "pain"

export const GANDALF_ANIM_KINDS: GandalfAnimKind[] = [
  "walking",
  "idle",
  "run",
  "jump",
  "bite",
  "headbut",
  "kick",
  "knockback",
  "pain",
]

/** loop=-1 애니 목록 (나머지는 repeat=0 one-shot). */
const LOOPING_ANIMS = new Set<GandalfAnimKind>(["walking", "idle", "run"])

function frameCount(preset: AvatarPreset, kind: GandalfAnimKind): number {
  switch (kind) {
    case "walking":
      return preset.walkFrames
    case "idle":
      return preset.idleFrames ?? 4
    case "run":
      return preset.runFrames ?? 4
    case "jump":
      return preset.jumpFrames
    case "bite":
      return preset.biteFrames ?? 6
    case "headbut":
      return preset.headbutFrames ?? 5
    case "kick":
      return preset.kickFrames
    case "knockback":
      return preset.knockbackFrames ?? 5
    case "pain":
      return preset.painFrames ?? 5
  }
}

function fps(preset: AvatarPreset, kind: GandalfAnimKind): number {
  switch (kind) {
    case "walking":
      return preset.walkFps
    case "idle":
      return preset.idleFps ?? 6
    case "run":
      return preset.runFps ?? 14
    case "jump":
      return preset.jumpFps
    case "bite":
      return preset.biteFps ?? 10
    case "headbut":
      return preset.headbutFps ?? 12
    case "kick":
      return preset.kickFps
    case "knockback":
      return preset.knockbackFps ?? 10
    case "pain":
      return preset.painFps ?? 8
  }
}

/** Phaser image 텍스처 키 — 프레임 단위. */
function gandalfTexKey(kind: GandalfAnimKind, frame: number, presetId: string): string {
  const preset = AVATAR_PRESETS[presetId]
  return `${preset.texturePrefix}-${kind}-${frame}`
}

/** Phaser anims.play() 용 애니 키. */
export function gandalfAnimKey(kind: GandalfAnimKind, presetId: string): string {
  const preset = AVATAR_PRESETS[presetId]
  return `${preset.texturePrefix}-${kind}`
}

/** 초기 표시용 첫 idle 프레임 텍스처 키. */
export function gandalfIdleTexKey(presetId: string): string {
  return gandalfTexKey("idle", 0, presetId)
}

function preloadGandalfPreset(scene: Phaser.Scene, presetId: string): void {
  const preset = AVATAR_PRESETS[presetId]
  if (!preset || preset.avatarSystem !== "gandalf") return

  for (const kind of GANDALF_ANIM_KINDS) {
    const count = frameCount(preset, kind)
    for (let i = 0; i < count; i++) {
      const key = gandalfTexKey(kind, i, presetId)
      if (!scene.textures.exists(key)) {
        const padded = String(i).padStart(3, "0")
        // /api/av/[preset]/[anim]/[frame] — extension 없는 URL so Next.js routes to API handler
        // ?v=N: 에셋 갱신 시 버전을 올려 immutable 캐시 무효화 (v3 = 목 그림자 alpha 복구판)
        scene.load.image(key, `/api/av/${preset.id}/${kind}/${padded}?v=3`)
      }
    }
  }
}

/** 등록된 모든 gandalf 프리셋을 preload. */
export function preloadAllGandalfPresets(scene: Phaser.Scene): void {
  for (const id of Object.keys(AVATAR_PRESETS)) {
    preloadGandalfPreset(scene, id)
  }
}

function createGandalfAnimsForPreset(scene: Phaser.Scene, presetId: string): void {
  const preset = AVATAR_PRESETS[presetId]
  if (!preset || preset.avatarSystem !== "gandalf") return

  for (const kind of GANDALF_ANIM_KINDS) {
    const key = gandalfAnimKey(kind, presetId)
    if (scene.anims.exists(key)) continue

    const count = frameCount(preset, kind)
    const frames = Array.from({ length: count }, (_, i) => ({
      key: gandalfTexKey(kind, i, presetId),
    }))

    scene.anims.create({
      key,
      frames,
      frameRate: fps(preset, kind),
      repeat: LOOPING_ANIMS.has(kind) ? -1 : 0,
    })
  }
}

/** 등록된 모든 gandalf 프리셋의 Phaser anim 등록. */
export function createAllGandalfAnims(scene: Phaser.Scene): void {
  for (const id of Object.keys(AVATAR_PRESETS)) {
    createGandalfAnimsForPreset(scene, id)
  }
}

/** one-shot 애니(bite/headbut/kick/knockback/pain) 여부. */
function gandalfIsOneShot(kind: GandalfAnimKind): boolean {
  return !LOOPING_ANIMS.has(kind)
}

// ============================================================
// IndoorMapScene 호환 API — Container 기반 body+hair 레이어 시스템.
// TODO: body/hair 분리 스프라이트 에셋이 준비되면 구현 완성.
// ============================================================

const GANDALF_BODY_TEX = "gandalf-body-sheet"
const GANDALF_HAIR_TEX = "gandalf-hair-sheet"

/** IndoorMapScene 의 상태 이름 (indoor 씬 고유 — IndoorActionState 와 동일). */
export type GandalfState = "idle" | "walk" | "run" | "jump" | "fall" | "attack"

/**
 * IndoorMapScene 아바타 래퍼 — Container + body/hair sprite + 헬퍼 메서드.
 * body+hair 분리 에셋 미준비 상태: body 스프라이트만 표시, hair 는 alpha 0.
 */
export class GandalfAvatar {
  readonly container: Phaser.GameObjects.Container
  readonly body: Phaser.GameObjects.Sprite
  readonly hair: Phaser.GameObjects.Sprite
  private _currentState: GandalfState = "idle"
  private readonly _presetId: string

  constructor(
    container: Phaser.GameObjects.Container,
    body: Phaser.GameObjects.Sprite,
    hair: Phaser.GameObjects.Sprite,
    presetId: string
  ) {
    this.container = container
    this.body = body
    this.hair = hair
    this._presetId = presetId
  }

  /** bite/headbut 등 GandalfState 매핑에 없는 one-shot 애니를 직접 재생. 완료 처리는 씬 책임. */
  playOneShot(kind: GandalfAnimKind): void {
    this.body.play(gandalfAnimKey(kind, this._presetId), true)
  }

  playAnim(state: GandalfState): void {
    this._currentState = state
    // indoor state → gandalf anim kind 매핑 (분리 에셋 미준비, body 스프라이트만 사용)
    const kind = this._mapToAnimKind(state)
    const key = gandalfAnimKey(kind, this._presetId)
    if (this.body.anims.currentAnim?.key !== key || !this.body.anims.isPlaying) {
      this.body.play(key, true)
    }
  }

  setFlipX(flip: boolean): void {
    this.body.setFlipX(flip)
    this.hair.setFlipX(flip)
  }

  getCurrentState(): GandalfState {
    return this._currentState
  }

  private _mapToAnimKind(state: GandalfState): GandalfAnimKind {
    switch (state) {
      case "walk":
        return "walking"
      case "run":
        return "run"
      case "jump":
      case "fall":
        return "jump"
      case "attack":
        return "kick"
      case "idle":
      default:
        return "idle"
    }
  }
}

/** IndoorMapScene preload — 현재 male-basic 합성 스프라이트 fallback. */
export function preloadGandalf(scene: Phaser.Scene): void {
  preloadAllGandalfPresets(scene)
}

/** IndoorMapScene anim 등록. */
export function createGandalfAnimations(scene: Phaser.Scene): void {
  createAllGandalfAnims(scene)
}

/**
 * IndoorMapScene Container 기반 아바타 생성.
 * body+hair 분리 에셋 미준비 → male-basic 합성 스프라이트로 임시 렌더.
 */
export function createGandalfAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  presetId: string = "male-basic"
): GandalfAvatar {
  const body = scene.add.sprite(0, 0, gandalfIdleTexKey(presetId)).setOrigin(0.5, 1.0)
  const hair = scene.add.sprite(0, 0, gandalfIdleTexKey(presetId)).setOrigin(0.5, 1.0)
  hair.setAlpha(0) // 분리 에셋 미준비: hair 는 숨김
  const container = scene.add.container(x, y, [body, hair])
  return new GandalfAvatar(container, body, hair, presetId)
}
