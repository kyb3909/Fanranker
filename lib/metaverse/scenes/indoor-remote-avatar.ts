/**
 * IndoorRemoteAvatar — IndoorMapScene 의 원격 사용자 1명을 렌더.
 *
 * Gandalf body+hair Container 합성, 위치는 half-life lerp, 클릭 시 sceneBridge user:clicked
 * emit (UserActionPopover 가 수신해 차단/뮤트 메뉴 띄움).
 */

import * as Phaser from "phaser"
import { GANDALF_BODY_TEX, GANDALF_HAIR_TEX } from "@/lib/metaverse/avatar/gandalf-avatar"
import type {
  IndoorPresence,
  IndoorActionState,
  IndoorFacing,
} from "@/lib/metaverse/realtime/indoor-presence-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

const LERP_HALF_LIFE_MS = 80
const AVATAR_VISUAL_SCALE = 2 // local 과 동일

function bodyAnimKey(state: IndoorActionState): string {
  return `gandalf_${state}_body`
}
function hairAnimKey(state: IndoorActionState): string {
  return `gandalf_${state}_hair`
}

export class IndoorRemoteAvatar {
  readonly userId: string
  private nickname: string
  private readonly container: Phaser.GameObjects.Container
  private readonly body: Phaser.GameObjects.Sprite
  private readonly hair: Phaser.GameObjects.Sprite
  private readonly nameTag: Phaser.GameObjects.Text
  private targetX: number
  private targetY: number
  private facing: IndoorFacing
  private action: IndoorActionState

  constructor(scene: Phaser.Scene, state: IndoorPresence) {
    this.userId = state.userId
    this.nickname = state.nickname
    this.targetX = state.x
    this.targetY = state.y
    this.facing = state.facing
    this.action = state.action

    this.body = scene.add.sprite(0, 0, GANDALF_BODY_TEX, 0).setOrigin(0.5, 1.0)
    this.hair = scene.add.sprite(0, 0, GANDALF_HAIR_TEX, 0).setOrigin(0.5, 1.0)
    this.body.setScale(AVATAR_VISUAL_SCALE)
    this.hair.setScale(AVATAR_VISUAL_SCALE)
    // 로컬과 동일 flip 정책 — facing="east" 일 때 flip
    this.body.setFlipX(state.facing === "east")
    this.hair.setFlipX(state.facing === "east")
    this.body.play(bodyAnimKey(state.action), true)
    this.hair.play(hairAnimKey(state.action), true)

    this.container = scene.add.container(state.x, state.y, [this.body, this.hair])
    this.container.setDepth(9) // 로컬(10) 보다 살짝 뒤
    // 클릭 hitbox — sprite 가로 시각 약 80*2=160, 세로 64*2=128. origin 0.5,1.0 기준 아래/가운데.
    this.container.setSize(160, 128)
    this.container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-80, -128, 160, 128),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })

    this.container.on("pointerdown", () => {
      const cam = scene.cameras.main
      const screenX = (this.container.x - cam.worldView.x) * cam.zoom
      const screenY = (this.container.y - cam.worldView.y) * cam.zoom
      sceneBridge.emit("user:clicked", {
        userId: this.userId,
        nickname: this.nickname,
        screenX,
        screenY,
      })
    })

    this.nameTag = scene.add
      .text(state.x, state.y + 4, state.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setDepth(20)
  }

  applyState(state: IndoorPresence): void {
    this.targetX = state.x
    this.targetY = state.y
    if (state.facing !== this.facing) {
      this.facing = state.facing
      this.body.setFlipX(state.facing === "east")
      this.hair.setFlipX(state.facing === "east")
    }
    if (state.action !== this.action) {
      this.action = state.action
      this.body.play(bodyAnimKey(state.action), true)
      this.hair.play(hairAnimKey(state.action), true)
    }
    if (state.nickname !== this.nickname) {
      this.nickname = state.nickname
      this.nameTag.setText(state.nickname)
    }
  }

  update(deltaMs: number): void {
    // 1차 exponential lerp — half-life 80ms (네트워크 jitter 흡수)
    const k = 1 - Math.pow(0.5, deltaMs / LERP_HALF_LIFE_MS)
    this.container.x += (this.targetX - this.container.x) * k
    this.container.y += (this.targetY - this.container.y) * k
    this.nameTag.setPosition(this.container.x, this.container.y + 4)
  }

  destroy(): void {
    this.container.destroy()
    this.nameTag.destroy()
  }
}
