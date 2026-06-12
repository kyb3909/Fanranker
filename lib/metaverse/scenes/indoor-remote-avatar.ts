/**
 * IndoorRemoteAvatar — IndoorMapScene 의 원격 사용자 1명을 렌더.
 *
 * GandalfAvatar Container 합성, 위치는 half-life lerp, 클릭 시 sceneBridge user:clicked
 * emit (UserActionPopover 가 수신해 차단/뮤트 메뉴 띄움).
 */

import * as Phaser from "phaser"
import {
  createGandalfAvatar,
  type GandalfAvatar,
  type GandalfState,
} from "@/lib/metaverse/avatar/gandalf-avatar"
import { MALE_BASIC_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import type {
  IndoorPresence,
  IndoorActionState,
  IndoorFacing,
} from "@/lib/metaverse/realtime/indoor-presence-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

const LERP_HALF_LIFE_MS = 80
const AVATAR_VISUAL_SCALE = 2 // local 과 동일

export class IndoorRemoteAvatar {
  readonly userId: string
  private nickname: string
  private readonly avatar: GandalfAvatar
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

    this.avatar = createGandalfAvatar(scene, state.x, state.y, MALE_BASIC_AVATAR_KEY)
    this.avatar.body.setScale(AVATAR_VISUAL_SCALE)
    this.avatar.hair.setScale(AVATAR_VISUAL_SCALE)
    // east = 오른쪽(기본). west 일 때 flipX.
    this.avatar.setFlipX(state.facing === "west")
    this.avatar.playAnim(state.action as GandalfState)

    const container = this.avatar.container
    container.setDepth(9) // 로컬(10) 보다 살짝 뒤
    // 클릭 hitbox — 128*2=256 wide, 117*2=234 tall. origin 0.5,1.0 기준.
    container.setSize(256, 234)
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-128, -234, 256, 234),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    })
    container.on("pointerdown", () => {
      const cam = scene.cameras.main
      const screenX = (container.x - cam.worldView.x) * cam.zoom
      const screenY = (container.y - cam.worldView.y) * cam.zoom
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
      this.avatar.setFlipX(state.facing === "west")
    }
    if (state.action !== this.action) {
      this.action = state.action
      this.avatar.playAnim(state.action as GandalfState)
    }
    if (state.nickname !== this.nickname) {
      this.nickname = state.nickname
      this.nameTag.setText(state.nickname)
    }
  }

  update(deltaMs: number): void {
    const container = this.avatar.container
    const k = 1 - Math.pow(0.5, deltaMs / LERP_HALF_LIFE_MS)
    container.x += (this.targetX - container.x) * k
    container.y += (this.targetY - container.y) * k
    this.nameTag.setPosition(container.x, container.y + 4)
  }

  destroy(): void {
    this.avatar.container.destroy()
    this.nameTag.destroy()
  }
}
