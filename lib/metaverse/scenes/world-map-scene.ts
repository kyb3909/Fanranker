/**
 * WorldMapScene — 메타버스 Phase 1b 월드맵 씬.
 *
 * Phase 1b (현재):
 *  - 플레이스홀더 지형 (UK 실루엣 rect)
 *  - 내 아바타 (WASD/화살표 이동, 카메라 follow)
 *  - Supabase Realtime Presence로 원격 유저 실시간 표시 (보간 이동)
 *  - 월드 채팅 broadcast (proximity 말풍선은 UI 오버레이 담당 예정)
 *
 * 아바타: `lib/metaverse/avatar/pro-avatar.ts` (PixelLab 8방향 × 4프레임).
 *
 * Phase 2+ 에셋 교체 지점:
 *  - drawLandPlaceholder → tilemap
 */

import * as Phaser from "phaser"
import { METAVERSE, pinToWorldX, pinToWorldY } from "@/lib/metaverse/constants"
import type {
  MetaversePlayerIdentity,
  RemotePlayerState,
  Direction,
  WorldChatMessage,
  WorldPlot,
  ChatRoomMeta,
} from "@/lib/metaverse/types"
import type { WorldChannel } from "@/lib/metaverse/realtime/world-channel"
import type { RoomChannel } from "@/lib/metaverse/realtime/room-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { trackEvent } from "@/lib/analytics/events"
import { isMuted } from "@/lib/metaverse/mute-list"
import {
  preloadProAvatar,
  createProAvatarAnimations,
  textureKeyIdle,
  animKeyWalk,
  direction8FromVelocity,
  direction4To8,
  type Direction8,
} from "@/lib/metaverse/avatar/pro-avatar"
import { ChatBubble } from "./chat-bubble"
import { PlotMarker, Signboard } from "./plot-marker"

export const WORLD_MAP_SCENE_KEY = "MetaverseWorldMap"

// 원격 유저 보간: 새 target 받으면 200ms 안에 따라잡도록 지수 smoothing
const REMOTE_LERP_HALF_LIFE_MS = 80
// 124×124 PixelLab 캔버스 → 월드에서 실제 보이는 크기로 축소
const AVATAR_SCALE = 0.4

export class WorldMapScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private channel: WorldChannel | null = null

  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>

  private lastDirection: Direction = "down"
  private lastDir8: Direction8 = "south"
  private remotePlayers = new Map<string, RemoteAvatar>()
  private chatBubbles = new Map<string, ChatBubble>()
  private isChatInputOpen = false
  private unsubRemote: (() => void) | null = null
  private unsubChat: (() => void) | null = null
  private unsubWorldRoomCreated: (() => void) | null = null
  private unsubWorldRoomClosed: (() => void) | null = null
  private unsubBridgeOpen: (() => void) | null = null
  private unsubBridgeClose: (() => void) | null = null
  private unsubBridgeRoomCreated: (() => void) | null = null
  private unsubBridgeRoomClosed: (() => void) | null = null
  private unsubBridgeRoomAttach: (() => void) | null = null
  private unsubBridgeRoomDetach: (() => void) | null = null
  private unsubBridgeChatSend: (() => void) | null = null
  private unsubRoomChat: (() => void) | null = null

  /** 활성 방 채널 (Plot 진입 시 attach, 이탈 시 detach) */
  private currentRoomChannel: RoomChannel | null = null

  // Plot + Signboard (Phase 3)
  private plots: WorldPlot[] = []
  private initialRooms: ChatRoomMeta[] = []
  private plotMarkers = new Map<string, PlotMarker>() // plotId → marker
  private signboards = new Map<string, Signboard>() // plotId → signboard
  /** 현재 내 아바타가 서있는 plotId (없으면 null). 진입/이탈 이벤트 디듀프용 */
  private currentPlotId: string | null = null

  constructor() {
    super(WORLD_MAP_SCENE_KEY)
  }

  private initialPlotCode?: string

  init(data: {
    identity: MetaversePlayerIdentity
    channel?: WorldChannel | null
    plots?: WorldPlot[]
    rooms?: ChatRoomMeta[]
    initialPlotCode?: string
  }) {
    this.identity = data.identity
    this.channel = data.channel ?? null
    this.plots = data.plots ?? []
    this.initialRooms = data.rooms ?? []
    this.initialPlotCode = data.initialPlotCode
  }

  preload() {
    preloadProAvatar(this)
    if (!this.textures.exists("england-map")) {
      this.load.image("england-map", "/map/regions/eng.png")
    }
    if (!this.textures.exists("wembley-hex")) {
      this.load.image("wembley-hex", "/map/objects/hex-stadium-wembley.webp")
    }
    if (!this.textures.exists("highbury-icon")) {
      this.load.image("highbury-icon", "/map/objects/highbury-icon.webp")
    }
  }

  create() {
    const { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BG } = METAVERSE

    this.cameras.main.setBackgroundColor(COLOR_BG)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // 영국 픽셀아트 지도 — 1122×1402 (사용자 신규 자산, 본섬만)
    this.add.image(0, 0, "england-map").setOrigin(0, 0).setDepth(0)

    // 광장 마커 + 스타디움 입구 — 실제 영국 지리 기준 percent 좌표
    this.drawPlazaMarker("런던 광장", 72, 80)
    this.drawPlazaMarker("맨체스터 광장", 58, 56)
    this.drawPlazaMarker("리버풀 광장", 53, 58)
    this.drawPlazaMarker("뉴캐슬 광장", 66, 39)
    this.drawWembleyEntrance(71, 79)
    // 실제 영국 Highbury 위치 — Wembley 동쪽 ~11km, 거의 같은 위도 (살짝 북)
    this.drawHighburyEntrance(73, 78)

    // 광장 Plot 마커 + 기존 Signboard (Phase 3)
    this.renderPlots()

    // 8방향 walk anim 등록 (self + remote 공용)
    createProAvatarAnimations(this)

    // 스폰 좌표 결정 — deep-link plot_code 가 있으면 해당 Plot, 아니면 런던 중앙 광장
    const spawnPlot = this.initialPlotCode
      ? this.plots.find((p) => p.plotCode === this.initialPlotCode)
      : null
    const spawnX = spawnPlot ? pinToWorldX(spawnPlot.pinX) : pinToWorldX(51)
    const spawnY = spawnPlot ? pinToWorldY(spawnPlot.pinY) : pinToWorldY(70)
    this.player = this.physics.add.sprite(spawnX, spawnY, textureKeyIdle("south"))
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
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

      // 다른 유저가 방 개설/close 시 Signboard 실시간 동기화
      this.unsubWorldRoomCreated = this.channel.onRoomCreated((room) => {
        this.addSignboard(room)
      })
      this.unsubWorldRoomClosed = this.channel.onRoomClosed(({ plotId }) => {
        this.removeSignboard(plotId)
      })
    }

    // React UI로부터 chat 입력 open/close 상태 받기
    this.unsubBridgeOpen = sceneBridge.on("chat:input:open", () => {
      this.isChatInputOpen = true
    })
    this.unsubBridgeClose = sceneBridge.on("chat:input:close", () => {
      this.isChatInputOpen = false
    })

    // 방 개설/종료 브로드캐스트 → Signboard 동기화
    this.unsubBridgeRoomCreated = sceneBridge.on("room:created", (room) => {
      if (!room) return
      this.addSignboard({
        id: room.id,
        plotId: room.plotId,
        ownerUserId: room.ownerUserId,
        signText: room.signText,
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
      })
    })
    this.unsubBridgeRoomClosed = sceneBridge.on("room:closed", (payload) => {
      if (payload) this.removeSignboard(payload.plotId)
    })

    // 방 채널 attach/detach — Plot 진입 시 PhaserCanvas가 생성 후 알림
    this.unsubBridgeRoomAttach = sceneBridge.on("room:channel:attach", (payload) => {
      if (!payload) return
      this.attachRoomChannel(payload.channel)
    })
    this.unsubBridgeRoomDetach = sceneBridge.on("room:channel:detach", () => {
      this.detachRoomChannel()
    })

    // UI → scene: 채팅 전송 요청을 받아 적절한 채널로 라우팅
    this.unsubBridgeChatSend = sceneBridge.on("chat:send", (payload) => {
      if (!payload?.text) return
      const scope: "world" | "room" = this.currentRoomChannel ? "room" : "world"
      const target: WorldChannel | RoomChannel | null = this.currentRoomChannel ?? this.channel
      target?.publishChat(payload.text)
      trackEvent({
        name: "metaverse_chat_send",
        params: { scope, length: payload.text.length },
      })
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

    // 8방향 walk anim — 속도 벡터 기준. 정지 시엔 lastDir8 방향 idle 텍스처
    const dir8 = direction8FromVelocity(body.velocity.x, body.velocity.y)
    if (dir8) {
      if (this.lastDir8 !== dir8 || this.player.anims.currentAnim?.key !== animKeyWalk(dir8)) {
        this.lastDir8 = dir8
        this.player.play(animKeyWalk(dir8), true)
      }
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(textureKeyIdle(this.lastDir8))
    }

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

    // Plot 진입/이탈 감지 (내 아바타 위치 기준)
    this.updatePlotOccupancy()
  }

  // ============================================================
  // Realtime sync
  // ============================================================

  private syncRemotePlayers(remote: Map<string, RemotePlayerState>) {
    // 추가/업데이트
    for (const [userId, state] of remote) {
      let avatar = this.remotePlayers.get(userId)
      if (!avatar) {
        avatar = new RemoteAvatar(this, state)
        this.remotePlayers.set(userId, avatar)
      } else {
        avatar.setTarget(state.x, state.y, state.direction, state.isMoving, state.nickname)
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
      // 뮤트 필터 — 자기 자신은 뮤트 적용 안 함
      if (isMuted(msg.userId)) return
    }
    // 채팅 로그 패널로 emit (뮤트/proximity 통과한 것만)
    sceneBridge.emit("chat:log:append", {
      userId: msg.userId,
      nickname: msg.nickname,
      text: msg.text,
      timestamp: msg.timestamp,
      scope: "world",
    })
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

  private attachRoomChannel(channel: RoomChannel) {
    // 기존 room 있으면 정리 후 교체
    this.detachRoomChannel()
    this.currentRoomChannel = channel
    this.unsubRoomChat = channel.onChatMessage((msg) => {
      const isSelf = msg.userId === this.identity.userId
      if (!isSelf && isMuted(msg.userId)) return
      sceneBridge.emit("chat:log:append", {
        userId: msg.userId,
        nickname: msg.nickname,
        text: msg.text,
        timestamp: msg.timestamp,
        scope: "room",
      })
      // 방 메시지는 proximity 필터 없이 sender 아바타 위에 바로 표시
      this.showChatBubble(msg.userId, msg.text)
    })
  }

  private detachRoomChannel() {
    this.unsubRoomChat?.()
    this.unsubRoomChat = null
    this.currentRoomChannel = null
  }

  private teardown() {
    this.unsubRemote?.()
    this.unsubChat?.()
    this.unsubWorldRoomCreated?.()
    this.unsubWorldRoomClosed?.()
    this.unsubBridgeOpen?.()
    this.unsubBridgeClose?.()
    this.unsubBridgeRoomCreated?.()
    this.unsubBridgeRoomClosed?.()
    this.unsubBridgeRoomAttach?.()
    this.unsubBridgeRoomDetach?.()
    this.unsubBridgeChatSend?.()
    this.unsubRoomChat?.()
    this.unsubRemote = null
    this.unsubChat = null
    this.unsubWorldRoomCreated = null
    this.unsubWorldRoomClosed = null
    this.unsubBridgeOpen = null
    this.unsubBridgeClose = null
    this.unsubBridgeRoomCreated = null
    this.unsubBridgeRoomClosed = null
    this.unsubBridgeRoomAttach = null
    this.unsubBridgeRoomDetach = null
    this.unsubBridgeChatSend = null
    this.unsubRoomChat = null
    this.currentRoomChannel = null
    for (const avatar of this.remotePlayers.values()) avatar.destroy()
    this.remotePlayers.clear()
    for (const bubble of this.chatBubbles.values()) bubble.destroy()
    this.chatBubbles.clear()
    for (const marker of this.plotMarkers.values()) marker.destroy()
    this.plotMarkers.clear()
    for (const sign of this.signboards.values()) sign.destroy()
    this.signboards.clear()
    this.currentPlotId = null
  }

  // ============================================================
  // Plot + Signboard (Phase 3)
  // ============================================================

  private renderPlots() {
    // 빈 Plot 마커
    for (const plot of this.plots) {
      const marker = new PlotMarker(this, {
        id: plot.id,
        centerX: pinToWorldX(plot.pinX),
        centerY: pinToWorldY(plot.pinY),
        widthUnits: plot.widthUnits,
        heightUnits: plot.heightUnits,
      })
      this.plotMarkers.set(plot.id, marker)
    }
    // 점유 상태 + Signboard
    for (const room of this.initialRooms) {
      this.addSignboard(room)
    }
  }

  /** 새로 개설된 방 또는 초기 로딩 시 Signboard 추가 */
  addSignboard(room: ChatRoomMeta) {
    const marker = this.plotMarkers.get(room.plotId)
    if (!marker) return
    marker.setOccupied(true)
    const existing = this.signboards.get(room.plotId)
    if (existing) existing.destroy()
    const sign = new Signboard(this, marker.x, marker.y, room.id, room.ownerUserId, room.signText)
    this.signboards.set(room.plotId, sign)

    // 내가 지금 이 Plot 위에 있으면 plot:enter 재방출해서 roomId/ownerUserId 반영
    if (this.currentPlotId === room.plotId) {
      const plot = this.plots.find((p) => p.id === room.plotId)
      if (plot) {
        sceneBridge.emit("plot:enter", {
          plotId: plot.id,
          plotCode: plot.plotCode,
          plazaName: plot.plazaName,
          roomId: room.id,
          ownerUserId: room.ownerUserId,
        })
      }
    }
  }

  /** 방이 닫히거나 제거될 때 Signboard 제거 */
  removeSignboard(plotId: string) {
    const marker = this.plotMarkers.get(plotId)
    marker?.setOccupied(false)
    const sign = this.signboards.get(plotId)
    if (sign) {
      sign.destroy()
      this.signboards.delete(plotId)
    }

    // 지금 내가 이 Plot 위에 서있는데 방이 사라진 경우 → plot:enter 를 roomId 없이
    // 재방출해서 방 채널을 detach 하도록 강제.
    if (this.currentPlotId === plotId) {
      const plot = this.plots.find((p) => p.id === plotId)
      if (plot) {
        sceneBridge.emit("plot:enter", {
          plotId: plot.id,
          plotCode: plot.plotCode,
          plazaName: plot.plazaName,
          roomId: undefined,
        })
      }
    }
  }

  private updatePlotOccupancy() {
    if (this.plotMarkers.size === 0) return
    let insideId: string | null = null
    for (const [plotId, marker] of this.plotMarkers) {
      if (marker.contains(this.player.x, this.player.y)) {
        insideId = plotId
        break
      }
    }
    if (insideId === this.currentPlotId) return

    this.currentPlotId = insideId

    if (!insideId) {
      sceneBridge.emit("plot:leave")
      return
    }

    const plot = this.plots.find((p) => p.id === insideId)
    if (!plot) return
    const sign = this.signboards.get(insideId)
    sceneBridge.emit("plot:enter", {
      plotId: plot.id,
      plotCode: plot.plotCode,
      plazaName: plot.plazaName,
      roomId: sign?.roomId,
      ownerUserId: sign?.ownerUserId,
    })
  }

  // ============================================================
  // Placeholder rendering helpers
  // ============================================================

  /**
   * 웸블리 경기장 — 데코레이션 (현재 클릭 비활성, 향후 Wembley 맵 추가 시 클릭 핸들러 연결).
   * 라벨로 위치만 표시.
   */
  private drawWembleyEntrance(pinX: number, pinY: number) {
    const x = pinToWorldX(pinX)
    const y = pinToWorldY(pinY)

    this.add.image(x, y, "wembley-hex").setScale(0.5).setDepth(6)

    this.add
      .text(x, y - 60, "🏟️  웸블리 구장", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#37474f",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(7)
  }

  /**
   * 하이버리 경기장 입구 — 클릭 가능한 isometric 픽셀아트 아이콘.
   * 클릭 시 `highbury:enter` bridge 이벤트 → 상위 래퍼가 /metaverse/highbury 로 라우팅.
   */
  private drawHighburyEntrance(pinX: number, pinY: number) {
    const x = pinToWorldX(pinX)
    const y = pinToWorldY(pinY)

    // highbury-icon.webp 는 384×384 — 월드맵 비율 맞춰 0.4 = 154×154 정도
    const icon = this.add
      .image(x, y, "highbury-icon")
      .setScale(0.4)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })

    const label = this.add
      .text(x, y - 90, "🏟️  하이버리 · 클릭해 입장", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#c62828",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(7)

    // 호버 피드백 — 살짝 떠오르고 라벨 강조
    icon.on("pointerover", () => {
      this.tweens.add({ targets: icon, y: y - 6, scale: 0.44, duration: 150 })
      this.tweens.add({ targets: label, scale: 1.05, duration: 150 })
    })
    icon.on("pointerout", () => {
      this.tweens.add({ targets: icon, y, scale: 0.4, duration: 150 })
      this.tweens.add({ targets: label, scale: 1.0, duration: 150 })
    })
    icon.on("pointerdown", () => {
      sceneBridge.emit("highbury:enter")
    })
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
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly nameTag: Phaser.GameObjects.Text
  private readonly userId: string
  private nickname: string
  private targetX: number
  private targetY: number
  private dir8: Direction8
  private isMoving: boolean

  constructor(scene: Phaser.Scene, state: RemotePlayerState) {
    this.userId = state.userId
    this.nickname = state.nickname
    this.dir8 = direction4To8(state.direction)
    this.isMoving = state.isMoving
    this.sprite = scene.add
      .sprite(state.x, state.y, textureKeyIdle(this.dir8))
      .setScale(AVATAR_SCALE)
      .setDepth(10)
      .setInteractive({ useHandCursor: true })
    if (state.isMoving) {
      this.sprite.play(animKeyWalk(this.dir8))
    }
    this.sprite.on("pointerdown", () => {
      // 카메라 변환된 월드 좌표 → 화면 좌표 (popover 위치용)
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

  setTarget(x: number, y: number, direction: Direction, isMoving: boolean, nickname: string) {
    this.targetX = x
    this.targetY = y
    if (this.nickname !== nickname) {
      this.nickname = nickname
      this.nameTag.setText(nickname)
    }
    const nextDir = direction4To8(direction)
    if (isMoving) {
      // 같은 방향·같은 anim 재생 중이면 play 재호출 안 함 — 프레임 리셋 방지
      if (
        nextDir !== this.dir8 ||
        this.sprite.anims.currentAnim?.key !== animKeyWalk(nextDir) ||
        !this.sprite.anims.isPlaying
      ) {
        this.sprite.play(animKeyWalk(nextDir), true)
      }
    } else if (this.isMoving || nextDir !== this.dir8) {
      this.sprite.anims.stop()
      this.sprite.setTexture(textureKeyIdle(nextDir))
    }
    this.dir8 = nextDir
    this.isMoving = isMoving
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
