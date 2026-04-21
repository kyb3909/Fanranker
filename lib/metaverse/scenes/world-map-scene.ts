/**
 * WorldMapScene — 메타버스 Phase 1b 월드맵 씬.
 *
 * Phase 1b (현재):
 *  - 플레이스홀더 지형 (UK 실루엣 rect)
 *  - 내 아바타 (WASD/화살표 이동, 카메라 follow)
 *  - Supabase Realtime Presence로 원격 유저 실시간 표시 (보간 이동)
 *  - 월드 채팅 broadcast (proximity 말풍선은 UI 오버레이 담당 예정)
 *
 * Phase 2+ 에셋 교체 지점:
 *  - drawLandPlaceholder → tilemap
 *  - createPlayerTexture → 스프라이트시트 + 방향별 애니메이션
 */

import * as Phaser from "phaser"
import { METAVERSE, pinToWorldX, pinToWorldY } from "@/lib/metaverse/constants"
import type {
  MetaversePlayerIdentity,
  RemotePlayerState,
  Direction,
  WorldChatMessage,
} from "@/lib/metaverse/types"
import type { WorldChannel } from "@/lib/metaverse/realtime/world-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { ChatBubble } from "./chat-bubble"

export const WORLD_MAP_SCENE_KEY = "MetaverseWorldMap"

const SELF_TEXTURE = "mv-player-self"
const OTHER_TEXTURE = "mv-player-other"
// 원격 유저 보간: 새 target 받으면 200ms 안에 따라잡도록 지수 smoothing
const REMOTE_LERP_HALF_LIFE_MS = 80

export class WorldMapScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private channel: WorldChannel | null = null

  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>

  private lastDirection: Direction = "down"
  private remotePlayers = new Map<string, RemoteAvatar>()
  private chatBubbles = new Map<string, ChatBubble>()
  private isChatInputOpen = false
  private unsubRemote: (() => void) | null = null
  private unsubChat: (() => void) | null = null
  private unsubBridgeOpen: (() => void) | null = null
  private unsubBridgeClose: (() => void) | null = null

  constructor() {
    super(WORLD_MAP_SCENE_KEY)
  }

  init(data: { identity: MetaversePlayerIdentity; channel?: WorldChannel | null }) {
    this.identity = data.identity
    this.channel = data.channel ?? null
  }

  create() {
    const { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BG, COLOR_LAND, COLOR_WATER } = METAVERSE

    this.cameras.main.setBackgroundColor(COLOR_BG)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // 플레이스홀더 지형
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, COLOR_WATER).setOrigin(0, 0)
    this.drawLandPlaceholder(COLOR_LAND)
    this.drawPlazaMarker("런던 광장", 51, 70)
    this.drawPlazaMarker("맨체스터 광장", 41, 42)
    this.drawPlazaMarker("리버풀 광장", 38, 46)
    this.drawPlazaMarker("뉴캐슬 광장", 52, 30)

    // 아바타 텍스처 (placeholder — 나중에 스프라이트시트로 교체)
    this.createPlayerTexture(SELF_TEXTURE, METAVERSE.COLOR_PLAYER_SELF)
    this.createPlayerTexture(OTHER_TEXTURE, METAVERSE.COLOR_PLAYER_OTHER)

    // 스폰: 런던 중앙 광장 (Wembley 앞)
    const spawnX = pinToWorldX(51)
    const spawnY = pinToWorldY(70)
    this.player = this.physics.add.sprite(spawnX, spawnY, SELF_TEXTURE)
    this.player.setCollideWorldBounds(true)

    this.nameTag = this.add
      .text(
        this.player.x,
        this.player.y + METAVERSE.PLAYER_NAMETAG_OFFSET_Y,
        this.identity.nickname,
        {
          fontFamily: "sans-serif",
          fontSize: "12px",
          color: "#ffffff",
          backgroundColor: "#00000099",
          padding: { x: 4, y: 2 },
        }
      )
      .setOrigin(0.5, 1)
      .setDepth(20)

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >

    // 카메라
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.setZoom(1)

    // Realtime 구독
    if (this.channel) {
      this.channel.setInitialPosition(this.player.x, this.player.y)
      this.unsubRemote = this.channel.onRemotePlayersChange((remote) =>
        this.syncRemotePlayers(remote)
      )
      this.unsubChat = this.channel.onChatMessage((msg) => this.handleChatMessage(msg))
    }

    // React UI로부터 chat 입력 open/close 상태 받기
    this.unsubBridgeOpen = sceneBridge.on("chat:input:open", () => {
      this.isChatInputOpen = true
    })
    this.unsubBridgeClose = sceneBridge.on("chat:input:close", () => {
      this.isChatInputOpen = false
    })

    // 씬 종료 시 정리
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown())
  }

  update(_time: number, deltaMs: number) {
    if (!this.player) return

    const { PLAYER_SPEED } = METAVERSE
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    // 채팅 입력창 열려있을 때는 이동 차단 — 타이핑 중 월드가 움직이면 곤란
    if (!this.isChatInputOpen) {
      const left = this.cursors.left?.isDown || this.wasd.A.isDown
      const right = this.cursors.right?.isDown || this.wasd.D.isDown
      const up = this.cursors.up?.isDown || this.wasd.W.isDown
      const down = this.cursors.down?.isDown || this.wasd.S.isDown

      if (left) body.setVelocityX(-PLAYER_SPEED)
      else if (right) body.setVelocityX(PLAYER_SPEED)
      if (up) body.setVelocityY(-PLAYER_SPEED)
      else if (down) body.setVelocityY(PLAYER_SPEED)

      body.velocity.normalize().scale(PLAYER_SPEED)

      if (left) this.lastDirection = "left"
      else if (right) this.lastDirection = "right"
      else if (up) this.lastDirection = "up"
      else if (down) this.lastDirection = "down"
    }

    const isMoving = body.velocity.length() > 1

    // 닉네임 태그 follow
    this.nameTag.setPosition(this.player.x, this.player.y + METAVERSE.PLAYER_NAMETAG_OFFSET_Y)

    // Realtime publish (throttle는 채널 내부에서 처리)
    if (this.channel) {
      this.channel.publishPosition(this.player.x, this.player.y, this.lastDirection, isMoving)
    }

    // 원격 플레이어 보간
    for (const avatar of this.remotePlayers.values()) {
      avatar.update(deltaMs)
    }

    // 말풍선 위치 — 대응되는 아바타 머리 위로 고정
    this.updateChatBubblePositions()
  }

  // ============================================================
  // Realtime sync
  // ============================================================

  private syncRemotePlayers(remote: Map<string, RemotePlayerState>) {
    // 추가/업데이트
    for (const [userId, state] of remote) {
      let avatar = this.remotePlayers.get(userId)
      if (!avatar) {
        avatar = new RemoteAvatar(this, state, OTHER_TEXTURE)
        this.remotePlayers.set(userId, avatar)
      } else {
        avatar.setTarget(state.x, state.y, state.direction, state.nickname)
      }
    }
    // 떠난 유저 제거
    for (const [userId, avatar] of this.remotePlayers) {
      if (!remote.has(userId)) {
        avatar.destroy()
        this.remotePlayers.delete(userId)
      }
    }
  }

  // ============================================================
  // Chat (proximity 말풍선)
  // ============================================================

  private handleChatMessage(msg: WorldChatMessage) {
    const isSelf = msg.userId === this.identity.userId
    if (!isSelf) {
      // Proximity 필터 — 반경 밖이면 무시
      const dx = msg.x - this.player.x
      const dy = msg.y - this.player.y
      if (dx * dx + dy * dy > METAVERSE.BUBBLE_PROXIMITY_PX ** 2) return
    }
    this.showChatBubble(msg.userId, msg.text)
  }

  private showChatBubble(userId: string, text: string) {
    // 유저당 말풍선 1개만 유지
    this.chatBubbles.get(userId)?.destroy()

    const bubble = new ChatBubble(this, text)
    bubble.setAutoExpire(METAVERSE.BUBBLE_DURATION_MS)
    this.chatBubbles.set(userId, bubble)

    bubble.on(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.chatBubbles.get(userId) === bubble) {
        this.chatBubbles.delete(userId)
      }
    })
  }

  private updateChatBubblePositions() {
    const OFFSET_Y = METAVERSE.PLAYER_NAMETAG_OFFSET_Y - 14
    for (const [userId, bubble] of this.chatBubbles) {
      if (userId === this.identity.userId) {
        bubble.setPosition(this.player.x, this.player.y + OFFSET_Y)
      } else {
        const avatar = this.remotePlayers.get(userId)
        if (avatar) bubble.setPosition(avatar.getX(), avatar.getY() + OFFSET_Y)
      }
    }
  }

  private teardown() {
    this.unsubRemote?.()
    this.unsubChat?.()
    this.unsubBridgeOpen?.()
    this.unsubBridgeClose?.()
    this.unsubRemote = null
    this.unsubChat = null
    this.unsubBridgeOpen = null
    this.unsubBridgeClose = null
    for (const avatar of this.remotePlayers.values()) avatar.destroy()
    this.remotePlayers.clear()
    for (const bubble of this.chatBubbles.values()) bubble.destroy()
    this.chatBubbles.clear()
  }

  // ============================================================
  // Placeholder rendering helpers
  // ============================================================

  private createPlayerTexture(key: string, color: number) {
    if (this.textures.exists(key)) return
    const { PLAYER_SIZE } = METAVERSE
    const g = this.add.graphics()
    g.fillStyle(color, 1)
    g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
    g.lineStyle(2, 0xffffff, 1)
    g.strokeRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
    g.generateTexture(key, PLAYER_SIZE, PLAYER_SIZE)
    g.destroy()
  }

  private drawLandPlaceholder(color: number) {
    const shapes = [
      { x: 32, y: 20, w: 26, h: 40 }, // 스코틀랜드
      { x: 28, y: 35, w: 32, h: 30 }, // 잉글랜드 북부~중부
      { x: 34, y: 50, w: 30, h: 30 }, // 잉글랜드 남부
      { x: 26, y: 50, w: 12, h: 16 }, // 웨일스
    ]
    for (const s of shapes) {
      this.add
        .rectangle(pinToWorldX(s.x), pinToWorldY(s.y), pinToWorldX(s.w), pinToWorldY(s.h), color)
        .setOrigin(0, 0)
    }
  }

  private drawPlazaMarker(name: string, pinX: number, pinY: number) {
    const x = pinToWorldX(pinX)
    const y = pinToWorldY(pinY)
    this.add.circle(x, y, 80, 0xffd54f, 0.15).setStrokeStyle(2, 0xffd54f, 0.5)
    this.add
      .text(x, y - 90, name, {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#ffd54f",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(5)
  }
}

// ============================================================
// RemoteAvatar — 원격 유저 한 명 (스프라이트 + 닉네임) + 타겟 보간
// ============================================================

class RemoteAvatar {
  private readonly sprite: Phaser.GameObjects.Image
  private readonly nameTag: Phaser.GameObjects.Text
  private targetX: number
  private targetY: number

  constructor(scene: Phaser.Scene, state: RemotePlayerState, textureKey: string) {
    this.sprite = scene.add.image(state.x, state.y, textureKey).setDepth(10)
    this.nameTag = scene.add
      .text(state.x, state.y + METAVERSE.PLAYER_NAMETAG_OFFSET_Y, state.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(11)
    this.targetX = state.x
    this.targetY = state.y
  }

  getX(): number {
    return this.sprite.x
  }
  getY(): number {
    return this.sprite.y
  }

  setTarget(x: number, y: number, _direction: Direction, nickname: string) {
    this.targetX = x
    this.targetY = y
    if (this.nameTag.text !== nickname) this.nameTag.setText(nickname)
  }

  update(deltaMs: number) {
    // 지수 smoothing — half-life 기반, 프레임 속도 독립
    const alpha = 1 - Math.pow(0.5, deltaMs / REMOTE_LERP_HALF_LIFE_MS)
    this.sprite.x += (this.targetX - this.sprite.x) * alpha
    this.sprite.y += (this.targetY - this.sprite.y) * alpha
    this.nameTag.setPosition(this.sprite.x, this.sprite.y + METAVERSE.PLAYER_NAMETAG_OFFSET_Y)
  }

  destroy() {
    this.sprite.destroy()
    this.nameTag.destroy()
  }
}
