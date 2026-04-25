/**
 * SideScrollerRemoteAvatar — 사이드스크롤러 원격 유저 1명을 씬에 렌더.
 *
 * 월드맵의 RemoteAvatar 와 달리 2방향 (east/west) 만 쓰고 XL 에셋 사용.
 * Presence payload (SideScrollerPresence) 의 action 상태를 읽어 walk/jump/kick
 * 애니 동기화. 위치는 half-life 기반 exponential lerp.
 *
 * 각 원격 유저는 자기만의 `avatarKey` 프리셋을 사용할 수 있음 — 쇼핑/인벤토리로
 * 다른 유니폼을 입은 상태가 그대로 렌더링됨.
 */

import type * as Phaser from "phaser"
import { texKeyIdle, texKeyRotation, animKey } from "@/lib/metaverse/avatar/pro-avatar-xl"
import { DEFAULT_AVATAR_KEY, getAvatarPreset } from "@/lib/metaverse/avatar/presets"
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
  private avatarKey: string

  constructor(scene: Phaser.Scene, state: SideScrollerPresence) {
    this.userId = state.userId
    this.nickname = state.nickname
    this.targetX = state.x
    this.targetY = state.y
    this.facing = state.facing
    this.action = state.action
    this.avatarKey = state.avatarKey ?? DEFAULT_AVATAR_KEY
    const preset = getAvatarPreset(this.avatarKey)

    this.sprite = scene.add
      .sprite(state.x, state.y, texKeyIdle(state.facing, this.avatarKey))
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
      .text(state.x, state.y - preset.bodyHeight * 0.5 - 6, state.nickname, {
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
    const incomingAvatarKey = next.avatarKey ?? DEFAULT_AVATAR_KEY
    const avatarChanged = this.avatarKey !== incomingAvatarKey
    this.facing = next.facing
    this.action = next.action
    this.avatarKey = incomingAvatarKey
    if (facingChanged || actionChanged || avatarChanged) this.applyActionAnim()
  }

  private applyActionAnim() {
    const needFlip = this.facing === "west"
    const preset = getAvatarPreset(this.avatarKey)
    // 비-kick 상태로 진입하면 기본 스케일 복원 (kick 에서 나올 때 필요).
    const nonKickScale = AVATAR_SCALE
    switch (this.action) {
      case "walking": {
        this.sprite.setFlipX(false)
        this.sprite.setScale(nonKickScale)
        this.sprite.play(animKey("walk", this.facing, this.avatarKey), true)
        return
      }
      case "jumping": {
        this.sprite.setFlipX(false)
        this.sprite.setScale(nonKickScale)
        // 원격 점프는 완료 감지 불가 → 한 번 재생 후 idle 로 fallback
        const jumpKey = animKey("jump", this.facing, this.avatarKey)
        if (this.sprite.anims.currentAnim?.key !== jumpKey) {
          this.sprite.play(jumpKey, true)
        }
        return
      }
      case "kicking": {
        this.sprite.setFlipX(needFlip)
        // 프리셋별 kickScale 보정 — PixelLab 커스텀 kick 이 과하게 큰 경우 스케일 다운.
        this.sprite.setScale(AVATAR_SCALE * (preset.kickScale ?? 1))
        // kick 은 east 원본, west 는 flipX
        this.sprite.play(animKey("kick", "east", this.avatarKey), true)
        return
      }
      case "idle":
      case "turning":
      default: {
        this.sprite.setFlipX(false)
        this.sprite.setScale(nonKickScale)
        this.sprite.anims.stop()
        this.sprite.setTexture(texKeyRotation(this.facing, this.avatarKey))
      }
    }
  }

  update(deltaMs: number) {
    const alpha = 1 - Math.pow(0.5, deltaMs / REMOTE_LERP_HALF_LIFE_MS)
    this.sprite.x += (this.targetX - this.sprite.x) * alpha
    this.sprite.y += (this.targetY - this.sprite.y) * alpha
    const preset = getAvatarPreset(this.avatarKey)
    this.nameTag.setPosition(this.sprite.x, this.sprite.y - preset.bodyHeight * 0.5 - 6)
  }

  destroy() {
    this.sprite.destroy()
    this.nameTag.destroy()
  }
}
