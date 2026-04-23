/**
 * SideScrollerRemoteAvatar — 사이드스크롤러 원격 유저 1명을 씬에 렌더.
 *
 * 월드맵의 RemoteAvatar 와 달리 2방향 (east/west) 만 쓰고 XL 에셋 사용.
 * Presence payload (SideScrollerPresence) 의 action 상태를 읽어 walk/jump/
 * kick/headbutt 애니 동기화. 위치는 half-life 기반 exponential lerp.
 */

import type * as Phaser from "phaser"
import {
  AVATAR_PRO_XL,
  texKeyIdle,
  texKeyRotation,
  animKey,
} from "@/lib/metaverse/avatar/pro-avatar-xl"
import type { SideScrollerPresence, SideScrollerActionState } from "@/lib/metaverse/types"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

const REMOTE_LERP_HALF_LIFE_MS = 80
const AVATAR_SCALE = 1.0 // side-scroller 와 동일

export class SideScrollerRemoteAvatar {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly nameTag: Phaser.GameObjects.Text
  private readonly userId: string
  private nickname: string
  private targetX: number
  private targetY: number
  private facing: "east" | "west"
  private action: SideScrollerActionState

  constructor(scene: Phaser.Scene, state: SideScrollerPresence) {
    this.userId = state.userId
    this.nickname = state.nickname
    this.targetX = state.x
    this.targetY = state.y
    this.facing = state.facing
    this.action = state.action

    this.sprite = scene.add
      .sprite(state.x, state.y, texKeyIdle(state.facing))
      .setScale(AVATAR_SCALE)
      .setDepth(10)
      .setInteractive({ useHandCursor: true })

    this.sprite.on("pointerdown", () => {
      const cam = scene.cameras.main
      const screenX = (this.sprite.x - cam.worldView.x) * cam.zoom
      const screenY = (this.sprite.y - cam.worldView.y) * cam.zoom
      sceneBridge.emit("user:clicked", {
        userId: this.userId,
        nickname: this.nickname,
        screenX,
        screenY,
      })
    })

    this.nameTag = scene.add
      .text(state.x, state.y - AVATAR_PRO_XL.FRAME_HEIGHT * 0.4, state.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(11)

    this.applyActionAnim()
  }

  getX(): number {
    return this.sprite.x
  }
  getY(): number {
    return this.sprite.y
  }
  getUserId(): string {
    return this.userId
  }

  /** Presence 갱신 수신 시 호출 — 위치 target 업데이트 + action 변화 anim 적용. */
  setPresence(next: SideScrollerPresence) {
    this.targetX = next.x
    this.targetY = next.y
    if (this.nickname !== next.nickname) {
      this.nickname = next.nickname
      this.nameTag.setText(next.nickname)
    }
    const facingChanged = this.facing !== next.facing
    const actionChanged = this.action !== next.action
    this.facing = next.facing
    this.action = next.action
    if (facingChanged || actionChanged) this.applyActionAnim()
  }

  private applyActionAnim() {
    // facing 에 따라 flipX — east 원본, west 는 수평 반전 (kick·headbutt·stumble)
    // 단 walk/jump 는 east/west 전용 스프라이트 생성돼있어 flipX 불필요
    const needFlip = this.facing === "west"
    switch (this.action) {
      case "walking": {
        this.sprite.setFlipX(false)
        this.sprite.play(animKey("walk", this.facing), true)
        return
      }
      case "jumping": {
        this.sprite.setFlipX(false)
        // 원격 점프는 완료 감지 불가 → 한 번 재생 후 idle 로 fallback
        if (this.sprite.anims.currentAnim?.key !== animKey("jump", this.facing)) {
          this.sprite.play(animKey("jump", this.facing), true)
        }
        return
      }
      case "kicking": {
        this.sprite.setFlipX(needFlip)
        // kick 은 east 원본, west 는 flipX
        this.sprite.play(animKey("kick", "east"), true)
        return
      }
      case "headbutt": {
        this.sprite.setFlipX(needFlip)
        if (this.sprite.anims.exists(animKey("headbutt", "east"))) {
          this.sprite.play(animKey("headbutt", "east"), true)
        }
        return
      }
      case "stumbled": {
        this.sprite.setFlipX(needFlip)
        if (this.sprite.anims.exists(animKey("stumble", "east"))) {
          this.sprite.play(animKey("stumble", "east"), true)
        }
        return
      }
      case "idle":
      case "turning":
      default: {
        this.sprite.setFlipX(false)
        this.sprite.anims.stop()
        this.sprite.setTexture(texKeyRotation(this.facing))
      }
    }
  }

  update(deltaMs: number) {
    const alpha = 1 - Math.pow(0.5, deltaMs / REMOTE_LERP_HALF_LIFE_MS)
    this.sprite.x += (this.targetX - this.sprite.x) * alpha
    this.sprite.y += (this.targetY - this.sprite.y) * alpha
    this.nameTag.setPosition(this.sprite.x, this.sprite.y - AVATAR_PRO_XL.FRAME_HEIGHT * 0.4)
  }

  destroy() {
    this.sprite.destroy()
    this.nameTag.destroy()
  }
}
