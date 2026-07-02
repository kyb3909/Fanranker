/**
 * IndoorMapScene — 데이터 기반 사이드뷰 실내 맵 씬.
 *
 * 같은 클래스를 mapId 만 바꿔서 재시작 (`scene.restart`) 하면 다른 맵으로 페이드 전환.
 * `lib/metaverse/maps/map-config.ts` 의 `MAPS[mapId]` 를 읽어 background·floor·도어 세팅.
 *
 * 입력:
 *  - A/D 또는 ←/→ : 좌우 이동
 *  - Space : 점프
 *  - W 또는 ↑ : 도어 hitbox 안에 있을 때 다음 맵 진입
 *  - R (홀드) : 킥 충전. 놓으면 사거리 안 공이면 발사
 *
 * SideScrollerScene 와의 차이:
 *  - 멀티플레이/Realtime 없음 (단일 플레이 MVP)
 *  - 도어 트리거 + 페이드 전환 추가
 */

import * as Phaser from "phaser"
import { getDpr } from "@/lib/metaverse/dpr"
import { MAPS, type MapConfig, type MapId, type DoorConfig } from "@/lib/metaverse/maps/map-config"
import {
  preloadGandalf,
  createGandalfAnimations,
  type GandalfState,
} from "@/lib/metaverse/avatar/gandalf-avatar"
import {
  preloadLayered,
  createLayeredAnims,
  createLayeredAvatar,
  type LayeredAvatar,
  type Outfit,
} from "@/lib/metaverse/avatar/layered-avatar"
import { AVATAR_PRESETS, MALE_BASIC_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { METAVERSE } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import type {
  IndoorPresenceChannel,
  IndoorActionState,
} from "@/lib/metaverse/realtime/indoor-presence-channel"
import { ChatBubble } from "./chat-bubble"
import { IndoorRemoteAvatar } from "./indoor-remote-avatar"

// Gandalf 4방향 X · 좌우 facing 만 사용 (sheet 기준).
type Facing = "east" | "west"

/** 캐릭터 시각 + hitbox 공통 스케일. 1 = 2/3 에서 1.5배 키움 (사용자 요청). */
const AVATAR_VISUAL_SCALE = 1

// Player hitbox — sprite 80×64 보다 좁게 잡아 충돌·도어 자연스럽게. AVATAR_VISUAL_SCALE 적용.
const PLAYER_BODY_W = 28 * AVATAR_VISUAL_SCALE
const PLAYER_BODY_H = 56 * AVATAR_VISUAL_SCALE
/** Container 위치(=발끝) 기준으로 body 좌상단 offset. */
const PLAYER_BODY_OFFSET_X = -PLAYER_BODY_W / 2
const PLAYER_BODY_OFFSET_Y = -PLAYER_BODY_H

export const INDOOR_MAP_SCENE_KEY = "MetaverseIndoorMap"

/**
 * Phase 1b 슬라이스 — 하드코딩 outfit (남자 base + 1T 빨강 셔츠 + 기본 하의).
 * Phase 2 에서 identity 의 DB equipped 슬롯으로 교체 예정.
 */
const SLICE_OUTFIT: Outfit = { gender: "male", top: "1t", bottom: "basic" }

// 물리 — SideScrollerScene 와 동일 튜닝값 (걸음·점프·킥 감각 통일)
const GRAVITY_Y = 900
const JUMP_VELOCITY = -380
const WALK_SPEED = 300
const GROUND_ACCEL = 2200
const GROUND_DRAG = 1500
const AIR_ACCEL = 900
const AIR_DRAG = 50
const MAX_FALL_SPEED = 1200
const AVATAR_SCALE = 1.0

const FADE_DURATION_MS = 500

// 축구공 — 땅에 멈춰있다가 킥 입력 시 충전된 강도로 날아감
const BALL_TEXTURE = "indoor-soccer-ball"
const BALL_URL = "/metaverse/soccer-ball.png"
const BALL_FRAME = 32
const BALL_RADIUS_PX = 12
const BALL_CIRCLE_OFFSET = BALL_FRAME / 2 - BALL_RADIUS_PX
const BALL_GRAVITY = 900
const BALL_BOUNCE = 0.35
const BALL_DRAG_X = 180
const BALL_KICK_RANGE = 120 // px — 플레이어 어깨/몸통 근처면 킥 가능

// 충전 게이지 → 발사 속도·각도 lerp
const KICK_MIN_ANGLE_DEG = 10
const KICK_MAX_ANGLE_DEG = 45
const KICK_MIN_SPEED = 400
const KICK_MAX_SPEED = 900
const KICK_CHARGE_MAX_MS = 1200

interface IndoorMapInit {
  identity: MetaversePlayerIdentity
  mapId: MapId
  spawnX?: number
  /** 옵셔널 — Realtime presence 채널. null/undefined 면 싱글플레이 mode. */
  channel?: IndoorPresenceChannel | null
}

interface DoorHandle {
  rect: Phaser.Geom.Rectangle
  door: DoorConfig
  prompt: Phaser.GameObjects.Text
}

type PlayerState = "idle" | "walking" | "jumping" | "kicking" | "acting"

export class IndoorMapScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private mapConfig!: MapConfig
  private spawnX!: number
  private avatarVisualH: number = 64
  /** 실제 사용할 gandalf 프리셋 키 — identity.avatarKey 가 gandalf 이면 그것, 아니면 male-basic. */
  private gandalfPresetId: string = MALE_BASIC_AVATAR_KEY

  /** Container + base·bottom·top sprite 합성 아바타(레이어드). physics body 는 container 에 붙음. */
  private avatar!: LayeredAvatar
  /** 기존 코드 호환용 alias — avatar.container. body 캐스팅으로 physics body 접근. */
  private player!: Phaser.GameObjects.Container
  private nameTag!: Phaser.GameObjects.Text
  /** 로컬 채팅 말풍선 — chat:send 받으면 갱신, 5초 후 자동 destroy */
  private chatBubble: ChatBubble | null = null
  private unsubChatSend: (() => void) | null = null
  private unsubChatOpen: (() => void) | null = null
  private unsubChatClose: (() => void) | null = null
  /** 채팅 입력창이 열려 있는 동안은 이동/점프/킥 입력 모두 무시. 키 stuck 방지를 위해 reset 도 호출. */
  private isChatInputOpen = false
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private rKey!: Phaser.Input.Keyboard.Key
  private oneKey!: Phaser.Input.Keyboard.Key // 박치기 (headbut)
  private twoKey!: Phaser.Input.Keyboard.Key // 물기 (bite)
  // 모바일 터치 입력 — TouchControls 오버레이가 sceneBridge 로 전달. 키보드 입력과 OR 병합.
  private touchLeft = false
  private touchRight = false
  private touchJumpQueued = false
  private touchUpQueued = false
  private touchActionQueued = false
  private unsubTouch: (() => void)[] = []
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private doorHandles: DoorHandle[] = []

  // 축구공 + 킥 충전 상태 — hasBall=true 맵에서만 생성
  private ball: Phaser.Physics.Arcade.Sprite | null = null
  private chargeStartedAt: number | null = null
  private lastChargeEmitted: { active: boolean; progress: number } = { active: false, progress: 0 }
  private pendingKickSpeed: number | null = null
  private pendingKickAngleDeg: number | null = null
  private pendingBallX: number | null = null
  private pendingBallY: number | null = null
  /** 킥 진입 직전 sprite.y. 킥 동안 매 프레임 이 값으로 강제 — 어떤 이유로든 Y 변동 차단. */
  private kickLockY: number | null = null

  private facing: Facing = "east"
  private state: PlayerState = "idle"
  /** 페이드 전환 중에는 입력·도어 트리거 무시 — 중복 트리거 방지 */
  private isTransitioning = false

  /** 멀티플레이 presence 채널 (없으면 싱글). */
  private channel: IndoorPresenceChannel | null = null
  /** 원격 유저 아바타 Map — userId 키 */
  private remoteAvatars: Map<string, IndoorRemoteAvatar> = new Map()
  private unsubRemote: (() => void) | null = null

  constructor() {
    super(INDOOR_MAP_SCENE_KEY)
  }

  init(data: IndoorMapInit) {
    this.identity = data.identity
    this.mapConfig = MAPS[data.mapId]
    this.spawnX = data.spawnX ?? this.mapConfig.defaultSpawnX
    this.channel = data.channel ?? null
    // avatarKey 가 gandalf 프리셋이면 그것, 아니면 male-basic fallback
    const key = data.identity.avatarKey
    this.gandalfPresetId =
      key && AVATAR_PRESETS[key]?.avatarSystem === "gandalf" ? key : MALE_BASIC_AVATAR_KEY
    // Phase 1b: 레이어드 아바타(SLICE_OUTFIT)로 렌더. 치수(bodyHeight 등)는 male-basic 기준.
    this.gandalfPresetId = MALE_BASIC_AVATAR_KEY
    // restart() 후 상태 초기화
    this.isTransitioning = false
    this.facing = "east"
    this.state = "idle"
    this.doorHandles = []
    this.chargeStartedAt = null
    this.lastChargeEmitted = { active: false, progress: 0 }
    this.pendingKickSpeed = null
    this.pendingKickAngleDeg = null
    this.pendingBallX = null
    this.pendingBallY = null
    this.kickLockY = null
    this.ball = null
    // 원격 아바타는 매 restart 마다 새로 만든다 (transitionToMap 시 다음 씬에서 재구성)
    for (const avatar of this.remoteAvatars.values()) avatar.destroy()
    this.remoteAvatars.clear()
    this.unsubRemote?.()
    this.unsubRemote = null
  }

  preload() {
    const bgKey = `bg-${this.mapConfig.id}`
    if (!this.textures.exists(bgKey)) {
      this.load.image(bgKey, this.mapConfig.bgUrl)
    }
    if (this.mapConfig.hasBall && !this.textures.exists(BALL_TEXTURE)) {
      this.load.image(BALL_TEXTURE, BALL_URL)
    }
    preloadGandalf(this)
    preloadLayered(this, SLICE_OUTFIT)
  }

  create() {
    const { bgWidth, bgHeight, floorTopY } = this.mapConfig

    this.physics.world.setBounds(0, 0, bgWidth, bgHeight)
    this.physics.world.gravity.y = GRAVITY_Y

    this.cameras.main.setBackgroundColor("#000000")
    this.add.image(0, 0, `bg-${this.mapConfig.id}`).setOrigin(0, 0).setDepth(0)

    // invisible floor
    this.platforms = this.physics.add.staticGroup()
    const floor = this.add
      .rectangle(0, floorTopY, bgWidth, bgHeight - floorTopY, 0x000000, 0)
      .setOrigin(0, 0)
    this.platforms.add(floor)

    createGandalfAnimations(this)
    createLayeredAnims(this, SLICE_OUTFIT)

    // 레이어드 아바타(base+하의+상의) Container 생성. Container 자체에 arcade physics body 부여.
    const spawnY = floorTopY // origin (0.5, 1.0) → container.y == 발끝 Y
    this.avatar = createLayeredAvatar(this, this.spawnX, spawnY, SLICE_OUTFIT)
    // 시각 스케일 — 모든 레이어 스프라이트에 동일 적용 (hitbox 는 PLAYER_BODY_W/H 에 SCALE 반영됨).
    this.avatar.setScale(AVATAR_VISUAL_SCALE)
    this.player = this.avatar.container
    this.player.setDepth(10)
    this.physics.world.enable(this.player)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setSize(PLAYER_BODY_W, PLAYER_BODY_H)
    playerBody.setOffset(PLAYER_BODY_OFFSET_X, PLAYER_BODY_OFFSET_Y)
    playerBody.setCollideWorldBounds(true)
    playerBody.setBounce(0)
    playerBody.setMaxVelocity(WALK_SPEED, MAX_FALL_SPEED)
    this.physics.add.collider(this.player, this.platforms)
    this.avatarVisualH = PLAYER_BODY_H * AVATAR_SCALE
    this.avatar.playAnim("idle")

    // 멀티플레이 presence — 채널 있으면 초기 위치 publish + 원격 유저 sync 시작
    if (this.channel) {
      this.channel.setInitialPosition(this.player.x, this.player.y)
      this.unsubRemote = this.channel.onRemoteChange((remote) => this.applyRemoteState(remote))
    }

    // 킥(=attack) anim 완료 → 공 발사 + Y 락 한 번 더 강제 후 해제 + 중력 복원
    this.avatar.body.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        // 박치기(1)/물기(2) one-shot 완료 → idle 복귀
        if (
          anim.key === this.avatar.animKey("headbut") ||
          anim.key === this.avatar.animKey("bite")
        ) {
          if (this.state === "acting") {
            this.state = "idle"
            this.avatar.playAnim("idle")
          }
          return
        }
        if (anim.key !== this.avatar.animKey("kick")) return
        this.applyPendingKickToBall()
        const body = this.player.body as Phaser.Physics.Arcade.Body
        if (this.kickLockY !== null) {
          this.player.y = this.kickLockY
        }
        body.setVelocity(0, 0)
        // 잠금 해제 + 중력 복원
        this.kickLockY = null
        body.allowGravity = true
        this.state = "idle"
        this.avatar.playAnim("idle")
      }
    )

    // 축구공 — hasBall 인 맵에서만. floor 기준 휴지 위치에 스폰.
    if (this.mapConfig.hasBall) {
      const ballRestY = floorTopY - BALL_RADIUS_PX
      this.ball = this.physics.add.sprite(160, ballRestY - 24, BALL_TEXTURE)
      this.ball.setDepth(9)
      this.ball.setCollideWorldBounds(true)
      this.ball.setBounce(BALL_BOUNCE)
      this.ball.setDragX(BALL_DRAG_X)
      const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
      ballBody.setCircle(BALL_RADIUS_PX, BALL_CIRCLE_OFFSET, BALL_CIRCLE_OFFSET)
      ballBody.setGravityY(BALL_GRAVITY - GRAVITY_Y)
      this.physics.add.collider(this.ball, this.platforms)
    }

    // 닉네임 태그 — 아바타 하단 (말풍선이 머리 위 가리지 않도록)
    this.nameTag = this.add
      .text(this.player.x, this.player.y + this.avatarVisualH / 2 + 4, this.identity.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
        resolution: getDpr(), // camera zoom 만큼 글리프도 고해상도 렌더
      })
      .setOrigin(0.5, 0)
      .setDepth(20)

    // 채팅 — chat:send 받으면 머리 위 말풍선만 즉시 갱신 (자기 메시지 즉각 피드백).
    // chat:log:append 는 RoomChannel.onChatMessage 가 self-dispatch 로 처리 (HighburyStage).
    this.unsubChatSend = sceneBridge.on("chat:send", (payload) => {
      if (!payload?.text) return
      this.showChatBubble(payload.text)
    })

    // 채팅 입력창 open/close — 이동/점프 입력 차단 + Phaser 키보드 plugin 자체 disable.
    // 단순 isChatInputOpen flag 만으로는 부족: React event 의 stopPropagation 은 Phaser 의 native
    // window keydown listener 를 못 막음. input 타이핑 중 Phaser 가 D 등 keydown 받고, input close
    // 시점에 사용자가 이미 D 를 떼서 keyup 이 없어 isDown=true 로 stuck 됨.
    // → keyboard.enabled=false 로 input 동안 keydown/keyup 자체 차단.
    const resetAllKeys = () => {
      this.cursors.left?.reset()
      this.cursors.right?.reset()
      this.cursors.up?.reset()
      this.cursors.down?.reset()
      this.wasd.A.reset()
      this.wasd.D.reset()
      this.wasd.W.reset()
      this.wasd.S.reset()
      this.spaceKey.reset()
      this.rKey.reset()
      this.oneKey.reset()
      this.twoKey.reset()
      // 터치 입력도 초기화 — 채팅창 열림/blur 시 hold 가 stuck 되지 않도록
      this.touchLeft = false
      this.touchRight = false
      this.touchJumpQueued = false
      this.touchUpQueued = false
      this.touchActionQueued = false
    }
    this.unsubChatOpen = sceneBridge.on("chat:input:open", () => {
      this.isChatInputOpen = true
      resetAllKeys()
      if (this.input.keyboard) this.input.keyboard.enabled = false
      const body = this.player.body as Phaser.Physics.Arcade.Body
      body.setAccelerationX(0)
      body.setVelocityX(0)
    })
    this.unsubChatClose = sceneBridge.on("chat:input:close", () => {
      this.isChatInputOpen = false
      // close 시점에도 reset — disable 동안 freeze 된 key state 가 stale 한 isDown 가지지 않도록.
      resetAllKeys()
      if (this.input.keyboard) this.input.keyboard.enabled = true
    })

    // PIP 미니 모드 — 씬 키보드를 완전히 끊어 미니 창 상태에서 페이지 스크롤/타이핑을 방해하지 않는다.
    this.unsubTouch.push(
      sceneBridge.on("pip:mode", ({ mini }) => {
        resetAllKeys()
        if (this.input.keyboard) {
          this.input.keyboard.enabled = !mini
          if (mini) this.input.keyboard.disableGlobalCapture()
          else this.input.keyboard.enableGlobalCapture()
        }
        const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined
        if (mini && body) {
          body.setAccelerationX(0)
          body.setVelocityX(0)
        }
      })
    )

    // 모바일 터치 컨트롤 — TouchControls 오버레이가 emit. hold(move) + one-shot(jump/up/action).
    this.unsubTouch.push(
      sceneBridge.on("touch:move", ({ dir, active }) => {
        if (dir === "left") this.touchLeft = active
        else this.touchRight = active
      }),
      sceneBridge.on("touch:jump", () => {
        this.touchJumpQueued = true
      }),
      sceneBridge.on("touch:up", () => {
        this.touchUpQueued = true
      }),
      sceneBridge.on("touch:action", () => {
        this.touchActionQueued = true
      })
    )

    // window blur (alt-tab, 다른 탭 전환 등) 시 모든 키 reset — keyup 못 받아 stuck 되는 케이스 방지
    const onWindowBlur = () => {
      resetAllKeys()
      const body = this.player.body as Phaser.Physics.Arcade.Body
      body.setAccelerationX(0)
      body.setVelocityX(0)
    }
    window.addEventListener("blur", onWindowBlur)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("blur", onWindowBlur)
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubChatSend?.()
      this.unsubChatOpen?.()
      this.unsubChatClose?.()
      this.unsubChatSend = null
      this.unsubChatOpen = null
      this.unsubChatClose = null
      for (const unsub of this.unsubTouch) unsub()
      this.unsubTouch = []
      this.chatBubble?.destroy()
      this.chatBubble = null
      this.unsubRemote?.()
      this.unsubRemote = null
      for (const avatar of this.remoteAvatars.values()) avatar.destroy()
      this.remoteAvatars.clear()
    })

    // 도어 zones + prompts
    for (const door of this.mapConfig.doors) {
      const rect = new Phaser.Geom.Rectangle(door.x, door.y, door.width, door.height)
      const prompt = this.add
        .text(door.x + door.width / 2, door.y - 12, door.label, {
          fontFamily: "sans-serif",
          fontSize: "14px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#dc2626dd",
          padding: { x: 8, y: 4 },
          resolution: getDpr(),
        })
        .setOrigin(0.5, 1)
        .setDepth(25)
        .setVisible(false)
      this.doorHandles.push({ rect, door, prompt })
    }

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.oneKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE)
    this.twoKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO)

    // 카메라 — HiDPI: backing store 가 dpr 배 크므로 zoom 으로 월드 스케일 복원 (boot.ts 참고)
    this.cameras.main.setZoom(getDpr())
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, bgWidth, bgHeight)

    // 진입 페이드인
    this.cameras.main.fadeIn(FADE_DURATION_MS, 0, 0, 0)
  }

  update(_time: number, deltaMs: number) {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body

    // 채팅 입력창이 열려있으면 모든 입력 무시 + 즉시 정지 (키 stuck 시에도 안전)
    if (this.isChatInputOpen) {
      body.setAccelerationX(0)
      body.setVelocityX(0)
      this.updateNameTag()
      return
    }

    // 추가 안전망 — active element 가 form 요소 (input/textarea/button) 면 키 입력 무시 + 정지.
    // chat:input:open 이벤트 누락된 케이스 (다른 form 포커스, dev tools 등) 모두 커버.
    if (typeof document !== "undefined") {
      const ae = document.activeElement as HTMLElement | null
      if (ae) {
        const tag = ae.tagName
        const isFormFocused =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          ae.isContentEditable ||
          tag === "BUTTON"
        if (isFormFocused) {
          body.setAccelerationX(0)
          body.setVelocityX(0)
          this.updateNameTag()
          return
        }
      }
    }
    const onGround = body.blocked.down

    // 공 회전 + 바닥 안전 클램프 — 매 프레임
    this.updateBallTick(deltaMs)

    // 페이드 중엔 입력 무시. 단 charge bar 는 비활성화 emit 해서 HUD 동기화
    if (this.isTransitioning) {
      this.updateChargeBar()
      return
    }

    // 박치기/물기 중에는 이동 차단 (완료는 ANIMATION_COMPLETE 에서 idle 복귀)
    if (this.state === "acting") {
      body.setAccelerationX(0)
      body.setDragX(GROUND_DRAG)
      this.updateNameTag()
      this.updateChargeBar()
      return
    }

    // 킥 중에는 입력·이동 차단 + Y 강제 고정 (sprite.y 변동 원천 차단)
    if (this.state === "kicking") {
      if (this.kickLockY !== null) {
        this.player.y = this.kickLockY
        body.setVelocity(0, 0)
        body.updateFromGameObject()
      }
      body.setAccelerationX(0)
      body.setDragX(GROUND_DRAG)
      this.updateNameTag()
      this.updateChargeBar()
      return
    }

    const left = this.cursors.left?.isDown || this.wasd.A.isDown || this.touchLeft
    const right = this.cursors.right?.isDown || this.wasd.D.isDown || this.touchRight
    // one-shot 터치 큐 — 이번 프레임에 소비하고 즉시 비움 (키보드 JustDown 과 동일 의미)
    const touchUp = this.touchUpQueued
    this.touchUpQueued = false
    const touchJump = this.touchJumpQueued
    this.touchJumpQueued = false
    const touchAction = this.touchActionQueued
    this.touchActionQueued = false
    const upPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W) ||
      touchUp
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey) || touchJump
    const kickJustDown = this.mapConfig.hasBall && Phaser.Input.Keyboard.JustDown(this.rKey)
    const kickJustUp = this.mapConfig.hasBall && Phaser.Input.Keyboard.JustUp(this.rKey)
    const headbutPressed = Phaser.Input.Keyboard.JustDown(this.oneKey) || touchAction
    const bitePressed = Phaser.Input.Keyboard.JustDown(this.twoKey)

    // 박치기(1) / 물기(2) — 지상 one-shot. 킥 충전 중에는 무시.
    if ((headbutPressed || bitePressed) && onGround && this.chargeStartedAt === null) {
      this.state = "acting"
      body.setAccelerationX(0)
      body.setVelocityX(0)
      this.avatar.setFlipX(this.facing === "west")
      this.avatar.playOneShot(headbutPressed ? "headbut" : "bite")
      this.updateNameTag()
      this.updateChargeBar()
      return
    }

    const accelValue = onGround ? GROUND_ACCEL : AIR_ACCEL
    const dragValue = onGround ? GROUND_DRAG : AIR_DRAG

    // 킥 충전 시작 — 지상에서만 + hasBall 맵에서만
    if (kickJustDown && onGround && this.chargeStartedAt === null) {
      this.chargeStartedAt = this.time.now
    }

    // 킥 릴리즈 — 사거리 안 공이면 발사
    if (kickJustUp && this.chargeStartedAt !== null) {
      const heldMs = this.time.now - this.chargeStartedAt
      this.chargeStartedAt = null
      const ball = this.ball
      if (ball && onGround && this.ballInKickReach()) {
        const t = Math.min(heldMs / KICK_CHARGE_MAX_MS, 1)
        const speed = KICK_MIN_SPEED + (KICK_MAX_SPEED - KICK_MIN_SPEED) * t
        const angle = KICK_MIN_ANGLE_DEG + (KICK_MAX_ANGLE_DEG - KICK_MIN_ANGLE_DEG) * t
        this.state = "kicking"
        body.setAccelerationX(0)
        body.setVelocity(0, 0)
        body.setDragX(GROUND_DRAG)
        // 1. Y 잠금 (Container.y 고정값 저장)
        this.kickLockY = this.player.y
        // 2. 중력 차단
        body.allowGravity = false
        // 3. attack anim 재생 (kick = attack 매핑)
        this.avatar.playAnim("attack")
        this.avatar.setFlipX(this.facing === "west")
        // 공 임시 숨김 (킥 발사 직전 위치 기억)
        this.pendingBallX = ball.x
        this.pendingBallY = ball.y
        ball.setVisible(false)
        this.pendingKickSpeed = speed
        this.pendingKickAngleDeg = angle
        this.updateNameTag()
        this.updateChargeBar()
        return
      }
      // 사거리 밖 또는 공 없음 — 조용히 취소
    }

    // 좌우 이동
    if (left) {
      body.setAccelerationX(-accelValue)
      this.facing = "west"
    } else if (right) {
      body.setAccelerationX(accelValue)
      this.facing = "east"
    } else {
      body.setAccelerationX(0)
    }
    body.setDragX(dragValue)
    this.avatar.setFlipX(this.facing === "west")

    // 점프
    if (jumpPressed && onGround) {
      body.setVelocityY(JUMP_VELOCITY)
      this.state = "jumping"
      this.avatar.playAnim("jump")
    } else if (this.state === "jumping" && onGround && body.velocity.y >= 0) {
      this.state = "idle"
    }

    // 공중 상태 — 점프 후 v.y > 0 (낙하) 면 fall anim
    const inAir = !onGround
    if (inAir && body.velocity.y > 0) {
      const cur = this.avatar.getCurrentState()
      if (cur !== "fall") this.avatar.playAnim("fall")
    } else if (this.state !== "jumping") {
      // 지상 walk / idle 결정
      const moving = onGround && Math.abs(body.velocity.x) > 10
      this.state = moving ? "walking" : "idle"
      const desired: GandalfState = moving ? "walk" : "idle"
      if (this.avatar.getCurrentState() !== desired) {
        this.avatar.playAnim(desired)
      }
    }

    this.updateNameTag()
    this.updateChargeBar()

    // 도어 검사 — 위 입력 시 페이드 전환
    let insideAnyDoor = false
    for (const handle of this.doorHandles) {
      const inside = handle.rect.contains(this.player.x, this.player.y)
      handle.prompt.setVisible(inside)
      if (inside) insideAnyDoor = true
      if (inside && upPressed) {
        this.transitionToMap(handle.door.targetMapId, handle.door.targetSpawnX)
        return
      }
    }

    void insideAnyDoor

    // 멀티플레이 — 매 프레임 presence publish (200ms throttle 내부) + 원격 lerp
    if (this.channel) {
      const cur = this.avatar.getCurrentState() ?? "idle"
      this.channel.publishPresence(this.player.x, this.player.y, this.facing, cur)
    }
    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(deltaMs)
    }
  }

  // ============================================================
  // 멀티플레이 presence sync helpers
  // ============================================================

  private applyRemoteState(
    remote: Map<string, import("../realtime/indoor-presence-channel").IndoorPresence>
  ) {
    // 들어옴
    for (const [userId, state] of remote.entries()) {
      let avatar = this.remoteAvatars.get(userId)
      if (!avatar) {
        avatar = new IndoorRemoteAvatar(this, state)
        this.remoteAvatars.set(userId, avatar)
      } else {
        avatar.applyState(state)
      }
    }
    // 나감
    for (const userId of [...this.remoteAvatars.keys()]) {
      if (!remote.has(userId)) {
        const avatar = this.remoteAvatars.get(userId)
        avatar?.destroy()
        this.remoteAvatars.delete(userId)
      }
    }
  }

  // 사용 안 함 — type re-export 회피용 stub. 컴파일러가 import 사용 인식하도록.
  private _unusedActionStateHint(): IndoorActionState {
    return "idle"
  }

  // ============================================================
  // 공 / 킥 helpers
  // ============================================================

  private updateBallTick(deltaMs: number) {
    const ball = this.ball
    if (!ball || !ball.visible) return
    const ballBody = ball.body as Phaser.Physics.Arcade.Body
    const vx = ballBody.velocity.x
    if (Math.abs(vx) > 1) {
      ball.rotation += (vx / BALL_RADIUS_PX) * (deltaMs / 1000)
    }
    // 안전 클램프 — collider miss 로 floor 아래로 빠지면 floor 위로 끌어올림
    const ballRestY = this.mapConfig.floorTopY - BALL_RADIUS_PX
    if (ball.y > ballRestY + 4) {
      ball.setPosition(ball.x, ballRestY)
      ballBody.setVelocity(ballBody.velocity.x * 0.5, 0)
    }
  }

  private ballInKickReach(): boolean {
    const ball = this.ball
    if (!ball) return false
    const dx = ball.x - this.player.x
    const dy = ball.y - this.player.y
    return dx * dx + dy * dy <= BALL_KICK_RANGE * BALL_KICK_RANGE
  }

  private applyPendingKickToBall() {
    const ball = this.ball
    const speed = this.pendingKickSpeed
    const angleDeg = this.pendingKickAngleDeg
    const x = this.pendingBallX
    const y = this.pendingBallY
    this.pendingKickSpeed = null
    this.pendingKickAngleDeg = null
    this.pendingBallX = null
    this.pendingBallY = null
    this.avatar.setFlipX(this.facing === "west")
    if (!ball) return
    ball.setVisible(true)
    if (speed === null || angleDeg === null || x === null || y === null) return
    const ballRestY = this.mapConfig.floorTopY - BALL_RADIUS_PX
    const safeY = y > ballRestY ? ballRestY : y
    ball.setPosition(x, safeY)
    const sign = this.facing === "east" ? 1 : -1
    const angleRad = (angleDeg * Math.PI) / 180
    const vx = sign * speed * Math.cos(angleRad)
    const vy = -speed * Math.sin(angleRad)
    const ballBody = ball.body as Phaser.Physics.Arcade.Body
    ballBody.setVelocity(vx, vy)
  }

  private updateChargeBar() {
    const active = this.chargeStartedAt !== null
    const progress = active
      ? Math.min((this.time.now - this.chargeStartedAt!) / KICK_CHARGE_MAX_MS, 1)
      : 0
    const last = this.lastChargeEmitted
    if (last.active !== active || Math.abs(last.progress - progress) > 0.04) {
      this.lastChargeEmitted = { active, progress }
      sceneBridge.emit("charge:progress", { active, progress })
    }
  }

  private updateNameTag() {
    this.nameTag.setPosition(this.player.x, this.player.y + this.avatarVisualH / 2 + 4)
    if (this.chatBubble && this.chatBubble.active) {
      // container.y = 발끝 → 캐릭터 키(bodyHeight×scale) + 여백만큼 올려 머리 위에 배치
      const headH = AVATAR_PRESETS[this.gandalfPresetId].bodyHeight * AVATAR_VISUAL_SCALE
      this.chatBubble.setPosition(this.player.x, this.player.y - headH - 26)
    }
  }

  private showChatBubble(text: string) {
    this.chatBubble?.destroy()
    const bubble = new ChatBubble(this, text)
    bubble.setAutoExpire(METAVERSE.BUBBLE_DURATION_MS)
    bubble.on(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.chatBubble === bubble) this.chatBubble = null
    })
    this.chatBubble = bubble
  }

  // ============================================================
  // 맵 전환
  // ============================================================

  private transitionToMap(targetMapId: MapId, spawnX: number) {
    this.isTransitioning = true
    // charge HUD 초기화 — 페이드 중에 잔류 방지
    this.chargeStartedAt = null
    this.updateChargeBar()
    const cam = this.cameras.main
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({
        identity: this.identity,
        mapId: targetMapId,
        spawnX,
      } satisfies IndoorMapInit)
    })
    cam.fadeOut(FADE_DURATION_MS, 0, 0, 0)
  }
}
