/**
 * GandalfHardcore avatar — body + hair 두 sprite 합성 (Phaser Container).
 *
 * Sheet 구조: 800×432, 80×64 cell, 7행 × 10열.
 *  - row 0 (frame 0~4)   : idle (5)
 *  - row 1 (frame 10~17) : walk (8)
 *  - row 2 (frame 20~27) : run (8)
 *  - row 3 (frame 30~33) : jump (4)
 *  - row 4 (frame 40~43) : fall (4)
 *  - row 5 (frame 50~55) : attack (6)
 *
 * 두 sheet (Male_Skin1·Male_Hair1) 동일 frame 레이아웃 → 같은 state 키로 동시 play.
 * Container 자체에 physics body. 자식 sprite 는 origin (0.5, 1.0) 발끝 정렬.
 */

import * as Phaser from "phaser"

export const GANDALF_BODY_TEX = "gandalf-body"
export const GANDALF_HAIR_TEX = "gandalf-hair"
export const GANDALF_FRAME_W = 80
export const GANDALF_FRAME_H = 64

const BODY_URL = "/assets/characters/gandalf/Male_Skin1.png"
const HAIR_URL = "/assets/characters/gandalf/Male_Hair1.png"

export type GandalfState = "idle" | "walk" | "run" | "jump" | "fall" | "attack"

interface AnimDef {
  start: number
  end: number
  fps: number
  /** -1 = 무한 반복, 0 = 1회 */
  repeat: number
}

export const GANDALF_ANIMS: Record<GandalfState, AnimDef> = {
  idle: { start: 0, end: 4, fps: 8, repeat: -1 },
  walk: { start: 10, end: 17, fps: 12, repeat: -1 },
  run: { start: 20, end: 27, fps: 14, repeat: -1 },
  jump: { start: 30, end: 33, fps: 12, repeat: 0 },
  fall: { start: 40, end: 43, fps: 8, repeat: -1 },
  attack: { start: 50, end: 55, fps: 14, repeat: 0 },
}

const STATE_KEYS: GandalfState[] = ["idle", "walk", "run", "jump", "fall", "attack"]

/** body·hair 각자 텍스처별 anim 키 (texture-bound). */
function bodyAnimKey(state: GandalfState): string {
  return `gandalf_${state}_body`
}
function hairAnimKey(state: GandalfState): string {
  return `gandalf_${state}_hair`
}

export function preloadGandalf(scene: Phaser.Scene): void {
  if (!scene.textures.exists(GANDALF_BODY_TEX)) {
    scene.load.spritesheet(GANDALF_BODY_TEX, BODY_URL, {
      frameWidth: GANDALF_FRAME_W,
      frameHeight: GANDALF_FRAME_H,
    })
  }
  if (!scene.textures.exists(GANDALF_HAIR_TEX)) {
    scene.load.spritesheet(GANDALF_HAIR_TEX, HAIR_URL, {
      frameWidth: GANDALF_FRAME_W,
      frameHeight: GANDALF_FRAME_H,
    })
  }
}

export function createGandalfAnimations(scene: Phaser.Scene): void {
  for (const state of STATE_KEYS) {
    const def = GANDALF_ANIMS[state]
    const bodyKey = bodyAnimKey(state)
    if (!scene.anims.exists(bodyKey)) {
      scene.anims.create({
        key: bodyKey,
        frames: scene.anims.generateFrameNumbers(GANDALF_BODY_TEX, {
          start: def.start,
          end: def.end,
        }),
        frameRate: def.fps,
        repeat: def.repeat,
      })
    }
    const hairKey = hairAnimKey(state)
    if (!scene.anims.exists(hairKey)) {
      scene.anims.create({
        key: hairKey,
        frames: scene.anims.generateFrameNumbers(GANDALF_HAIR_TEX, {
          start: def.start,
          end: def.end,
        }),
        frameRate: def.fps,
        repeat: def.repeat,
      })
    }
  }
}

/** body·hair sprite 합성 + 공통 헬퍼. Container 가 physics body 를 가짐. */
export interface GandalfAvatar {
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Sprite
  hair: Phaser.GameObjects.Sprite
  /** state 애니메이션을 body·hair 동시 재생. ignoreIfPlaying=true 가 디폴트. */
  playAnim: (state: GandalfState) => void
  /** Container 는 setFlipX 없음 — 자식 sprite 각자 flip. */
  setFlipX: (flip: boolean) => void
  /** 현재 재생 중인 state 키 (마지막 호출값). 외부 state 머신 동기화용. */
  getCurrentState: () => GandalfState | null
}

export interface GandalfAvatarOptions {
  /** body·hair 의 setOrigin Y. 기본 1.0 (발끝). */
  originY?: number
}

export function createGandalfAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: GandalfAvatarOptions = {}
): GandalfAvatar {
  const originY = options.originY ?? 1.0

  const body = scene.add.sprite(0, 0, GANDALF_BODY_TEX, 0).setOrigin(0.5, originY)
  const hair = scene.add.sprite(0, 0, GANDALF_HAIR_TEX, 0).setOrigin(0.5, originY)
  // hair 가 body 위에 렌더 (Container 의 children index 순서로 결정)
  const container = scene.add.container(x, y, [body, hair])

  let currentState: GandalfState | null = null

  return {
    container,
    body,
    hair,
    playAnim(state) {
      // 같은 state 가 이미 재생 중이면 재시작 안 함 (ignoreIfPlaying=true)
      body.play(bodyAnimKey(state), true)
      hair.play(hairAnimKey(state), true)
      currentState = state
    },
    setFlipX(flip) {
      body.setFlipX(flip)
      hair.setFlipX(flip)
    },
    getCurrentState() {
      return currentState
    },
  }
}
