/**
 * Layered Avatar — 런타임 옷 레이어 합성(꾸미기, Path B).
 *
 * base(몸+머리) + bottom(하의) + top(상의) 스프라이트를 한 Container 에 쌓고, 같은 anim kind 를
 * 세 스프라이트에 동시 재생해 프레임 동기를 맞춘다. 세 레이어는 동일 프레임 수·FPS·포즈라
 * 같은 틱에 play() 하면 lockstep 으로 움직인다.
 *
 * 에셋: scripts/export-avatar-layers.mjs 가 만든 정적 PNG
 *   /metaverse/avatars/layered/<gender>/<slot-dir>/<anim>/frame_NNN.png
 *   slot-dir: base | top/<id> | bottom/<id>
 *
 * GandalfAvatar 와 호환되는 인터페이스(container, body, playAnim, playOneShot, setFlipX,
 * getCurrentState) + setScale/animKey 를 제공해, IndoorMapScene 이 거의 그대로 사용한다.
 * (base 가 anim driver — ANIMATION_COMPLETE 이 base 스프라이트에서 발생)
 */
import type * as Phaser from "phaser"
import { GANDALF_ANIM_KINDS, type GandalfAnimKind, type GandalfState } from "./gandalf-avatar"

export type Gender = "male" | "female"

/** 장착 구성 — Phase 2 에서 DB equipped 슬롯으로 대체 예정. */
export interface Outfit {
  gender: Gender
  /** 상의 id (top/<id>) — export-avatar-layers.mjs 디렉토리명: basic|1t|2t|3t|pink */
  top: string
  /** 하의 id (bottom/<id>): basic|blue */
  bottom: string
}

/** anim kind 별 프레임 수 — male-basic/female-basic 프리셋과 동일 (45프레임 9애니). */
const FRAMES: Record<GandalfAnimKind, number> = {
  walking: 4,
  idle: 4,
  run: 4,
  jump: 6,
  bite: 6,
  headbut: 5,
  kick: 6,
  knockback: 5,
  pain: 5,
}
const FPS: Record<GandalfAnimKind, number> = {
  walking: 10,
  idle: 6,
  run: 14,
  jump: 10,
  bite: 10,
  headbut: 12,
  kick: 12,
  knockback: 10,
  pain: 8,
}
const LOOPING = new Set<GandalfAnimKind>(["walking", "idle", "run"])

const ASSET_ROOT = "/metaverse/avatars/layered"

/** 슬롯 → 에셋 디렉토리. */
function slotDir(slot: "base" | "top" | "bottom", outfit: Outfit): string {
  if (slot === "base") return "base"
  return slot === "top" ? `top/${outfit.top}` : `bottom/${outfit.bottom}`
}

function texKey(gender: Gender, dir: string, kind: GandalfAnimKind, frame: number): string {
  return `lav-${gender}-${dir.replace("/", "-")}-${kind}-${frame}`
}
function animKeyOf(gender: Gender, dir: string, kind: GandalfAnimKind): string {
  return `lav-${gender}-${dir.replace("/", "-")}-${kind}`
}

/** outfit 의 3개 슬롯 디렉토리 (base, bottom, top 순 — Container 쌓는 순서와 동일). */
function outfitDirs(outfit: Outfit): string[] {
  return [slotDir("base", outfit), slotDir("bottom", outfit), slotDir("top", outfit)]
}

/** 지정 outfit 의 base+bottom+top 프레임 preload. */
export function preloadLayered(scene: Phaser.Scene, outfit: Outfit): void {
  for (const dir of outfitDirs(outfit)) {
    for (const kind of GANDALF_ANIM_KINDS) {
      for (let i = 0; i < FRAMES[kind]; i++) {
        const key = texKey(outfit.gender, dir, kind, i)
        if (scene.textures.exists(key)) continue
        const padded = String(i).padStart(3, "0")
        scene.load.image(key, `${ASSET_ROOT}/${outfit.gender}/${dir}/${kind}/frame_${padded}.png`)
      }
    }
  }
}

/** outfit 각 슬롯의 Phaser anim 등록. */
export function createLayeredAnims(scene: Phaser.Scene, outfit: Outfit): void {
  for (const dir of outfitDirs(outfit)) {
    for (const kind of GANDALF_ANIM_KINDS) {
      const key = animKeyOf(outfit.gender, dir, kind)
      if (scene.anims.exists(key)) continue
      const frames = Array.from({ length: FRAMES[kind] }, (_, i) => ({
        key: texKey(outfit.gender, dir, kind, i),
      }))
      scene.anims.create({ key, frames, frameRate: FPS[kind], repeat: LOOPING.has(kind) ? -1 : 0 })
    }
  }
}

function mapStateToKind(state: GandalfState): GandalfAnimKind {
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

export class LayeredAvatar {
  readonly container: Phaser.GameObjects.Container
  /** base = anim driver. ANIMATION_COMPLETE 은 이 스프라이트에서 발생. */
  readonly base: Phaser.GameObjects.Sprite
  readonly bottom: Phaser.GameObjects.Sprite
  readonly top: Phaser.GameObjects.Sprite
  private _state: GandalfState = "idle"
  private readonly _outfit: Outfit

  constructor(
    container: Phaser.GameObjects.Container,
    base: Phaser.GameObjects.Sprite,
    bottom: Phaser.GameObjects.Sprite,
    top: Phaser.GameObjects.Sprite,
    outfit: Outfit
  ) {
    this.container = container
    this.base = base
    this.bottom = bottom
    this.top = top
    this._outfit = outfit
  }

  /** GandalfAvatar 호환 — ANIMATION_COMPLETE 리스너가 붙는 driver 스프라이트. */
  get body(): Phaser.GameObjects.Sprite {
    return this.base
  }

  /** base 가 재생하는 anim 키 (씬의 kick/headbut/bite 완료 판정용). */
  animKey(kind: GandalfAnimKind): string {
    return animKeyOf(this._outfit.gender, "base", kind)
  }

  private _playKind(kind: GandalfAnimKind): void {
    this.base.play(animKeyOf(this._outfit.gender, "base", kind), true)
    this.bottom.play(animKeyOf(this._outfit.gender, slotDir("bottom", this._outfit), kind), true)
    this.top.play(animKeyOf(this._outfit.gender, slotDir("top", this._outfit), kind), true)
  }

  playAnim(state: GandalfState): void {
    this._state = state
    const kind = mapStateToKind(state)
    const baseKey = this.animKey(kind)
    if (this.base.anims.currentAnim?.key !== baseKey || !this.base.anims.isPlaying) {
      this._playKind(kind)
    }
  }

  /** bite/headbut 등 GandalfState 매핑 밖 one-shot 직접 재생. 완료 처리는 씬 책임. */
  playOneShot(kind: GandalfAnimKind): void {
    this._playKind(kind)
  }

  setFlipX(flip: boolean): void {
    this.base.setFlipX(flip)
    this.bottom.setFlipX(flip)
    this.top.setFlipX(flip)
  }

  setScale(s: number): void {
    this.base.setScale(s)
    this.bottom.setScale(s)
    this.top.setScale(s)
  }

  getCurrentState(): GandalfState {
    return this._state
  }
}

/** Container + base/bottom/top 스프라이트 합성 아바타 생성. (origin 0.5,1.0 = 발끝) */
export function createLayeredAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  outfit: Outfit
): LayeredAvatar {
  const mk = (dir: string) =>
    scene.add.sprite(0, 0, texKey(outfit.gender, dir, "idle", 0)).setOrigin(0.5, 1.0)
  const base = mk(slotDir("base", outfit))
  const bottom = mk(slotDir("bottom", outfit))
  const top = mk(slotDir("top", outfit))
  // 쌓는 순서: base → bottom → top (top 이 가장 위)
  const container = scene.add.container(x, y, [base, bottom, top])
  return new LayeredAvatar(container, base, bottom, top, outfit)
}
