/**
 * SideScrollerScene — 메이플스토리 스타일 실내 프로토타입 (Phase 4 선행).
 *
 * 검증 목표:
 *  - 중력 + 바닥 콜리전
 *  - 좌/우 이동 + 점프 (방향 flip)
 *  - 카메라 좌우 스크롤 (배경 이미지 따라 팬)
 *  - 닉네임 태그 follow
 *
 * 현재는 단독 scene. world-map-scene 과 별개 게임 인스턴스로 부트.
 * Phase 4 에서 월드맵 ↔ 실내 씬 전환 추가 예정.
 *
 * 배경: `public/metaverse/bg-stadium.png` (1916×821) — 경기장 전면부
 * 일러스트를 한 장짜리 이미지로 사용. 장기적으론 여러 배경(카페/펍/
 * 경기장/광장) 을 SceneType 으로 선택해서 동일 로직 재사용 예정.
 *
 * 에셋 교체 지점:
 *  - 플레이어 rect → 사이드뷰 스프라이트시트 (PixelLab view: "side")
 *  - 배경 이미지 → 테마별 스와프
 */

import * as Phaser from "phaser"
import { METAVERSE } from "@/lib/metaverse/constants"
import type {
  MetaversePlayerIdentity,
  SideScrollerActionState,
  SharedBallState,
  HeadbuttHitEvent,
  RoomChatMessage,
  SideScrollerPresence,
} from "@/lib/metaverse/types"
import type { SideScrollerChannel } from "@/lib/metaverse/realtime/sidescroll-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import {
  preloadProAvatarXl,
  createProAvatarXlAnimations,
  texKeyIdle,
  texKeyRotation,
  rotationPath,
  animKey,
  TURN_FRAME_MS,
  type Facing,
  type RotationDir,
} from "@/lib/metaverse/avatar/pro-avatar-xl"
import { ChatBubble } from "./chat-bubble"
import { SideScrollerRemoteAvatar } from "./sidescroll-remote-avatar"

export const SIDE_SCROLLER_SCENE_KEY = "MetaverseSideScroller"

// 물리 상수 — 메이플/플랫포머 느낌 튜닝용. 숫자 바꾸면 감각 즉시 달라짐.
const GRAVITY_Y = 900
// 점프 최대 높이 ≈ v²/(2g) = 380²/1800 ≈ 80px (캐릭터 display 높이 98px 의 ~82%).
// 메이플 스타일 springy 한 느낌 — 캐릭터가 커져서 상대 점프도 비례 조정.
const JUMP_VELOCITY = -380
const WALK_SPEED = 300 // 최대 수평 속도 (px/s) — 240 → 300 (25% 빨라짐)
// 가속/감속 — 지면 vs 공중 분리. 공중은 조작 덜 되고 관성 유지.
const GROUND_ACCEL = 2200 // 정지→최대 약 0.11s
const GROUND_DRAG = 1500 // 최대→정지 약 0.16s (짧은 슬라이드)
const AIR_ACCEL = 900 // 공중 좌우 조작 — 땅보다 둔함
const AIR_DRAG = 50 // 공중에선 거의 관성 유지
const MAX_FALL_SPEED = 1200

// 씬 크기 — 배경 이미지(bg-stadium.png 1916×821)와 정확히 일치.
const SCENE_WIDTH = 1916
const SCENE_HEIGHT = 821
// 바닥선 — 배경 이미지의 전면 잔디(꽃 있는 라인) 가 시작되는 y.
// 이 y 부터 캐릭터가 "서있는" 면. 아래쪽 돌벽/아치 영역은 보이지만
// 캐릭터는 그 위 잔디에서 좌우 이동.
const FLOOR_TOP_Y = 640
const FLOOR_HEIGHT = SCENE_HEIGHT - FLOOR_TOP_Y

// PixelLab 208×208 XL 프레임 → 1.0 스케일 (정수배, pixelArt 에서 가장 크리스프).
// 실제 캐릭터 픽셀은 x=86-120 (34 wide), y=60-158 (98 tall). 메이플 스타일
// 기준 화면 대비 ~20% 비중이 되도록 scale 0.5 → 1.0 으로 2배 확대.
// 프레임 외곽 50px 하단 패딩은 투명이라 floor 아래로 삐져나가도 무해.
const AVATAR_SCALE = 1.0
const AVATAR_BODY_W = 34
const AVATAR_BODY_H = 98
const AVATAR_BODY_OFFSET_X = 86
const AVATAR_BODY_OFFSET_Y = 60
// 시각 높이 (스케일 적용) — 닉네임/말풍선 오프셋 계산용
const AVATAR_VISUAL_H = AVATAR_BODY_H * AVATAR_SCALE

// 축구공 — 땅에 멈춰있다가 킥 입력 시 충전된 강도로 날아감.
// PixelLab 생성 32×32 PNG, 실제 공은 bbox (4,4)-(28,28) = 중앙 24×24.
const BALL_TEXTURE = "ss-soccer-ball"
const BALL_URL = "/metaverse/soccer-ball.png"
const BALL_FRAME = 32
const BALL_RADIUS_PX = 12 // 실제 공 반지름 (body 용)
const BALL_CIRCLE_OFFSET = BALL_FRAME / 2 - BALL_RADIUS_PX // = 4, bbox padding
const BALL_GRAVITY = 900 // 플레이어와 동일
const BALL_BOUNCE = 0.35
const BALL_DRAG_X = 180 // 지상 구름 마찰
const BALL_KICK_RANGE = 60 // 플레이어 발끝 ~ 공 거리가 이 이내일 때만 실제 킥 속도 인가
// 공 스폰 — 플레이어 초기 위치 (x=100) 바로 앞에 두어 처음부터 킥 체험 가능.
const BALL_RESPAWN_X = 160
const BALL_RESPAWN_Y = FLOOR_TOP_Y - 40

// 충전 게이지 — X 키 홀드 시간 → 킥 속도 + 각도.
// 옵션 B: 각도도 함께 lerp. 탭=땅볼슛(낮은 각), 풀차지=로빙샷(높은 각).
const KICK_MIN_ANGLE_DEG = 10 // 탭 최소 발사각 — 거의 땅에 깔린 그라운드볼
const KICK_MAX_ANGLE_DEG = 45 // 풀차지 최대 발사각 — 포물선 로빙
const KICK_MIN_SPEED = 400 // 탭 최소 속도 (px/s)
const KICK_MAX_SPEED = 900 // 풀차지 최대 속도 (px/s)
const KICK_CHARGE_MAX_MS = 1200 // 이 시간 이상 홀드해도 더 안 세짐

const BG_TEXTURE = "ss-bg-stadium"
const BG_URL = "/metaverse/bg-stadium.png"

// 박치기 관련 상수
const HEADBUTT_ANIM_MS = 400 // anim 전체 길이 (대략)
const HEADBUTT_LOCK_MS = 450 // 입력 잠금 (anim 완료까지 약간 버퍼)
const HEADBUTT_RANGE_PX = 60 // 앞쪽 이 거리 내에 상대 있으면 knock-back
const HEADBUTT_KNOCKBACK_VX = 260 // 박치기 맞은 쪽에 가해지는 수평 속도
const STUMBLE_DURATION_MS = 1200 // 넘어져있는 시간 (stumble anim + pause)
const GETUP_DURATION_MS = 700 // 일어나는 anim 시간

type PlayerState =
  | "idle"
  | "walking"
  | "jumping"
  | "kicking"
  | "turning"
  | "headbutt"
  | "stumbled"
  | "gettingUp"

export class SideScrollerScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private headbuttKey!: Phaser.Input.Keyboard.Key
  private platforms!: Phaser.Physics.Arcade.StaticGroup

  /** Realtime 채널 — 없으면 (데모 스탠드얼론) 싱글플레이 fallback */
  private channel: SideScrollerChannel | null = null
  /** 원격 유저 스프라이트 맵 — userId 키로 생성·삭제 */
  private remoteAvatars: Map<string, SideScrollerRemoteAvatar> = new Map()
  /** 원격 유저 말풍선 — userId 키 (공간이 좁아 proximity 필터 X, 전부 보여줌) */
  private remoteChatBubbles: Map<string, ChatBubble> = new Map()
  /** 박치기 맞아 넘어진 타이머 — 0 초과면 stumbled/gettingUp 상태 유지 */
  private stumbleEndsAt = 0
  private getupEndsAt = 0
  /** 채널 구독 해제 함수들 */
  private unsubRemote: (() => void) | null = null
  private unsubRemoteChat: (() => void) | null = null
  private unsubBallState: (() => void) | null = null
  private unsubHeadbuttHit: (() => void) | null = null
  /** 내가 공 authority 인가 — 내가 마지막으로 찬 경우 true, 원격 수신 받으면 false. */
  private ballLastPublishAt = 0
  /**
   * 가로 이동·점프·킥 애니용 방향 (east/west 만). 걷기·점프·킥 스프라이트는
   * 두 방향만 생성돼있어 사이드스크롤 gameplay 에 부합.
   */
  private facing: Facing = "east"
  /**
   * 현재 캐릭터가 바라보는 8방향 orientation. idle 표시 + turn 애니 대상.
   * 기본은 east (움직임과 동기). 사용자가 up/down 눌러 north/south 로도 전환.
   */
  private orientation: RotationDir = "east"
  private state: PlayerState = "idle"

  // 턴 애니메이션 — 8 rotation 이미지를 프레임 단위로 플립.
  private turnPath: RotationDir[] = []
  private turnFrameIdx = 0
  private turnFrameTimer = 0

  // 축구공 + 충전 게이지
  private ball!: Phaser.Physics.Arcade.Sprite
  private chargeStartedAt: number | null = null // Space 키 누른 시각 (ms). null 이면 충전 안 중.
  private chargeBarBg!: Phaser.GameObjects.Rectangle
  private chargeBarFill!: Phaser.GameObjects.Rectangle
  /** 다음 kick anim 완료 시 공에 적용할 속도 (facing + charge 로 계산). */
  private pendingKickSpeed: number | null = null
  /** 다음 kick anim 완료 시 공에 적용할 발사각 (deg, 수평 대비 상향). */
  private pendingKickAngleDeg: number | null = null
  /** 킥 시작 시점의 공 좌표 — anim 완료 시 여기서 velocity 인가해 끊김 방지. */
  private pendingBallX: number | null = null
  private pendingBallY: number | null = null
  /** 충전 중이지만 공이 범위 밖이면 "조준 필요" 토스트만 표시. */
  private missHintText: Phaser.GameObjects.Text | null = null

  // 채팅 — 데모 모드 (로컬 bubble 만, 서버 없음)
  private chatBubble: ChatBubble | null = null
  private isChatInputOpen = false
  private unsubChatSend: (() => void) | null = null
  private unsubChatOpen: (() => void) | null = null
  private unsubChatClose: (() => void) | null = null

  constructor() {
    super(SIDE_SCROLLER_SCENE_KEY)
  }

  init(data: { identity: MetaversePlayerIdentity; channel?: SideScrollerChannel | null }) {
    this.identity = data.identity
    this.channel = data.channel ?? null
  }

  preload() {
    if (!this.textures.exists(BG_TEXTURE)) {
      this.load.image(BG_TEXTURE, BG_URL)
    }
    if (!this.textures.exists(BALL_TEXTURE)) {
      this.load.image(BALL_TEXTURE, BALL_URL)
    }
    preloadProAvatarXl(this)
  }

  create() {
    // 월드 경계 + 중력 (이 씬 로컬 중력 — 월드맵 씬에 영향 없음)
    this.physics.world.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    this.physics.world.gravity.y = GRAVITY_Y

    // 배경 이미지 — 하늘/경기장/전경 모두 포함한 단일 일러스트.
    // scrollFactor 1 (디폴트) 로 카메라 팬 그대로 따라감.
    this.cameras.main.setBackgroundColor("#87ceeb") // 로드 실패 시 하늘색 fallback
    this.add.image(0, 0, BG_TEXTURE).setOrigin(0, 0).setDepth(0)

    // 보이지 않는 바닥 콜리전 — 배경 이미지의 전경(잔디·돌벽) 위에 캐릭터가 서도록.
    // 디버그 하고 싶을 땐 fillColor 를 0x00ff00, alpha 0.3 으로 일시 변경.
    this.platforms = this.physics.add.staticGroup()
    const invisibleFloor = this.add
      .rectangle(0, FLOOR_TOP_Y, SCENE_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
    this.platforms.add(invisibleFloor)

    // walk / jump / kick anim 등록 (east + west 독립)
    createProAvatarXlAnimations(this)

    // 플레이어 스프라이트 — 초기 east idle. XL 은 east/west 별도 스프라이트 사용.
    this.player = this.physics.add.sprite(100, FLOOR_TOP_Y - 100, texKeyIdle("east"))
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setMaxVelocity(WALK_SPEED, MAX_FALL_SPEED)
    // hitbox 는 캐릭터 몸통 근처만 — 투명 패딩 영역이 벽에 걸리는 느낌 방지
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setSize(AVATAR_BODY_W, AVATAR_BODY_H)
    playerBody.setOffset(AVATAR_BODY_OFFSET_X, AVATAR_BODY_OFFSET_Y)
    // 드래그는 update()에서 지면/공중 상황에 따라 갱신
    this.physics.add.collider(this.player, this.platforms)

    // kick 완료 → state 복귀 + 대기 중이던 공 속도 인가.
    // 중요: anim 완료 시 Phaser 는 last frame 에 머무름 (kick frame_003 에 공이
    // 그려져있으면 그대로 stuck). `syncIdleOrWalkAnim` 은 `anims.isPlaying` 이
    // true 일 때만 idle 텍스처 세팅 → complete 후엔 발동 X. 직접 idle texture 로
    // 리셋해 그려진 공이 남는 문제 방지.
    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        const key = anim.key
        if (key === animKey("kick", "east") || key === animKey("kick", "west")) {
          this.applyPendingKickToBall()
          this.state = "idle"
          this.orientation = this.facing
          this.player.setTexture(texKeyRotation(this.facing))
          this.player.setFlipX(false)
        } else if (key === animKey("headbutt", "east")) {
          // 박치기 anim 완료 → idle 복귀 (knock-back 은 이미 트리거 됐음)
          this.state = "idle"
          this.orientation = this.facing
          this.player.setTexture(texKeyRotation(this.facing))
          this.player.setFlipX(false)
        }
        // stumble/getup 완료는 시간 기반 처리 (update 에서), anim 복귀는 별도 텍스처 세팅 안 함
      }
    )

    // 축구공 — 항상 땅에 존재, 킥 입력 시에만 속도 인가.
    this.ball = this.physics.add.sprite(BALL_RESPAWN_X, BALL_RESPAWN_Y, BALL_TEXTURE)
    this.ball.setDepth(9)
    this.ball.setCollideWorldBounds(true)
    this.ball.setBounce(BALL_BOUNCE)
    this.ball.setDragX(BALL_DRAG_X)
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    // 32×32 PNG 중앙 24×24 가 실제 공 — body 원형 + offset 으로 투명 테두리 배제
    ballBody.setCircle(BALL_RADIUS_PX, BALL_CIRCLE_OFFSET, BALL_CIRCLE_OFFSET)
    ballBody.setGravityY(BALL_GRAVITY - GRAVITY_Y) // 월드 중력 위에 공 전용 추가 (동일하게 유지)
    this.physics.add.collider(this.ball, this.platforms)
    // 플레이어 ↔ 공 콜리전은 없음 — "공은 킥 입력 때만 날아감" 스펙대로 접촉만으로는 안 밀림.

    // 닉네임 태그
    this.nameTag = this.add
      .text(this.player.x, this.player.y - AVATAR_VISUAL_H / 2 - 6, this.identity.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(20)

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >
    // 액션 키: Space = 킥 (홀드 충전), R = 박치기, W = 점프 (wasd 에서 이미 가져옴)
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.headbuttKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)

    // 카메라 follow + 월드 경계
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)

    // 안내 (UI 오버레이)
    this.add
      .text(
        16,
        16,
        "← → 이동 · ↑ 뒤보기 · ↓ 앞보기 · W 점프 · Space 킥(충전) · R 박치기 · Enter 채팅",
        {
          fontFamily: "sans-serif",
          fontSize: "13px",
          color: "#ffffff",
          backgroundColor: "#000000aa",
          padding: { x: 8, y: 4 },
        }
      )
      .setScrollFactor(0)
      .setDepth(100)

    // 충전 게이지 — X 키 홀드 중에만 표시. 카메라 따라가지 않음 (화면 고정 UI).
    const barW = 240
    const barH = 14
    const barX = this.scale.width / 2 - barW / 2
    const barY = 50
    this.chargeBarBg = this.add
      .rectangle(barX, barY, barW, barH, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false)
    this.chargeBarFill = this.add
      .rectangle(barX + 1, barY + 1, 0, barH - 2, 0x4ade80, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(102)
      .setVisible(false)

    // Realtime 채널 구독 — 원격 유저·공·박치기 이벤트
    if (this.channel) {
      this.channel.setInitialPosition(this.player.x, this.player.y)
      this.unsubRemote = this.channel.onRemoteChange((remote) => this.syncRemoteAvatars(remote))
      this.unsubRemoteChat = this.channel.onChatMessage((msg) => this.handleRemoteChat(msg))
      this.unsubBallState = this.channel.onBallState((state) => this.handleRemoteBallState(state))
      this.unsubHeadbuttHit = this.channel.onHeadbuttHit((evt) => this.handleHeadbuttHit(evt))
    }

    // 채팅 브리지 구독 — React ChatOverlay 가 이벤트 보냄
    this.unsubChatOpen = sceneBridge.on("chat:input:open", () => {
      this.isChatInputOpen = true
    })
    this.unsubChatClose = sceneBridge.on("chat:input:close", () => {
      this.isChatInputOpen = false
    })
    this.unsubChatSend = sceneBridge.on("chat:send", (payload) => {
      if (!payload?.text) return
      // Realtime 있으면 broadcast, 없으면 로컬만 (자기 자신만 보임)
      if (this.channel) {
        this.channel.publishChat(payload.text)
      }
      sceneBridge.emit("chat:log:append", {
        userId: this.identity.userId,
        nickname: this.identity.nickname,
        text: payload.text,
        timestamp: Date.now(),
        scope: "local",
      })
      this.showChatBubble(payload.text)
    })

    // 씬 종료 시 정리
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown())
  }

  update(_time: number, deltaMs: number) {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const onGround = body.blocked.down

    // 공 회전 — 수평 속도 기준. 원주 = 2πr, r = BALL_RADIUS_PX (12).
    // 구르는 거리 ÷ 원주 = 한 바퀴. rad 로 환산: vx * dt / r (부호 그대로).
    if (this.ball.visible) {
      const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
      const vx = ballBody.velocity.x
      if (Math.abs(vx) > 1) {
        // 각속도 = vx / r (rad/s), frame 증가 = 각속도 * dt(초)
        this.ball.rotation += (vx / BALL_RADIUS_PX) * (deltaMs / 1000)
      }
    }

    // stumbled / gettingUp — 시간 기반 자동 전환. 입력 전부 잠김.
    if (this.state === "stumbled") {
      body.setAccelerationX(0)
      body.setVelocityX(0)
      body.setDragX(GROUND_DRAG)
      if (this.time.now >= this.stumbleEndsAt) {
        // stumble → gettingUp 전환
        this.state = "gettingUp"
        this.getupEndsAt = this.time.now + GETUP_DURATION_MS
        if (this.player.anims.exists(animKey("getup", "east"))) {
          this.player.play(animKey("getup", "east"), true)
          this.player.setFlipX(this.facing === "west")
        }
      }
      this.updateNameTag()
      this.publishPresenceIfChannel()
      return
    }
    if (this.state === "gettingUp") {
      body.setAccelerationX(0)
      body.setVelocityX(0)
      body.setDragX(GROUND_DRAG)
      if (this.time.now >= this.getupEndsAt) {
        this.state = "idle"
        this.player.setFlipX(false)
        this.player.setTexture(texKeyRotation(this.facing))
      }
      this.updateNameTag()
      this.publishPresenceIfChannel()
      return
    }

    // 박치기 — anim 재생 동안 락. 시작 시점에 hit 판정·broadcast 이미 완료.
    if (this.state === "headbutt") {
      body.setAccelerationX(0)
      body.setVelocityX(0)
      body.setDragX(GROUND_DRAG)
      this.updateNameTag()
      this.publishPresenceIfChannel()
      return
    }

    // 턴 애니메이션 — 8방향 rotation 프레임 순차 재생.
    // 좌우 입력 들어오면 즉시 중단하고 walking 으로 진입 (응답성 우선).
    if (this.state === "turning") {
      const leftDown = this.cursors.left?.isDown || this.wasd.A.isDown
      const rightDown = this.cursors.right?.isDown || this.wasd.D.isDown
      if (leftDown || rightDown) {
        this.cancelTurn()
        // fall through — 아래 일반 로직에서 walking 처리
      } else {
        this.advanceTurn(deltaMs)
        body.setAccelerationX(0)
        body.setDragX(GROUND_DRAG)
        this.updateNameTag()
        this.updateChargeBar()
        return
      }
    }

    // 킥 중에는 입력·이동 차단 — 발 심고 동작 완료까지 기다림
    if (this.state === "kicking") {
      body.setAccelerationX(0)
      body.setDragX(GROUND_DRAG)
      this.updateNameTag()
      return
    }

    const accelValue = onGround ? GROUND_ACCEL : AIR_ACCEL
    const dragValue = onGround ? GROUND_DRAG : AIR_DRAG

    // 채팅 입력창 열려있을 땐 이동·액션 모두 차단
    if (this.isChatInputOpen) {
      body.setAccelerationX(0)
      body.setDragX(GROUND_DRAG)
      this.syncIdleOrWalkAnim(onGround, body.velocity.x)
      this.updateNameTag()
      this.updateChargeBar()
      return
    }

    const left = this.cursors.left?.isDown || this.wasd.A.isDown
    const right = this.cursors.right?.isDown || this.wasd.D.isDown
    // W = 점프 (↑ 화살표는 뒤보기, Space 는 킥 충전)
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.wasd.W)
    const lookUpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up!)
    const lookDownPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down!)
    // Space = 킥 (hold 충전, release 발사)
    const kickJustDown = Phaser.Input.Keyboard.JustDown(this.spaceKey)
    const kickJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey)
    // R = 박치기
    const headbuttJustDown = Phaser.Input.Keyboard.JustDown(this.headbuttKey)

    // 디버그: R 눌렀을 때 조건 값 풀어서 표시 (Object collapsed 방지)
    if (headbuttJustDown) {
      const animExists = this.player.anims.exists(animKey("headbutt", "east"))
      const tex000Exists = this.textures.exists(
        `${"avatar-pro-xl"}-headbutt-east-0` // texKeyAnim pattern
      )
      console.log(
        `[sidescroll] R pressed — state=${this.state} onGround=${onGround} chatOpen=${this.isChatInputOpen} animExists=${animExists} tex000Exists=${tex000Exists}`
      )
    }

    // 박치기 트리거 — 지상에서만. 이 지점의 state ∈ {idle, walking, jumping} 이므로
    // 추가 방어 체크 불필요 (kicking/turning/stumbled/gettingUp/headbutt 은 이미 early return).
    if (headbuttJustDown && onGround) {
      this.state = "headbutt"
      body.setAccelerationX(0)
      body.setVelocityX(0)
      body.setDragX(GROUND_DRAG)
      this.orientation = this.facing
      this.player.setFlipX(this.facing === "west")
      if (this.player.anims.exists(animKey("headbutt", "east"))) {
        this.player.play(animKey("headbutt", "east"), true)
      } else {
        // anim 미생성 상태에서도 동작은 트리거 — 잠시 정지 후 idle 복귀 타이머
        this.time.delayedCall(HEADBUTT_LOCK_MS, () => {
          if (this.state === "headbutt") this.state = "idle"
        })
      }
      // 앞쪽 remote player 검출 → hit broadcast
      const sign = this.facing === "east" ? 1 : -1
      for (const [uid, av] of this.remoteAvatars) {
        const dx = av.getX() - this.player.x
        if (Math.sign(dx) === sign && Math.abs(dx) < HEADBUTT_RANGE_PX) {
          // Y 차이 적은 경우만 (같은 높이)
          if (Math.abs(av.getY() - this.player.y) < 60) {
            this.channel?.publishHeadbuttHit(uid, sign * HEADBUTT_KNOCKBACK_VX)
          }
        }
      }
      this.updateNameTag()
      this.publishPresenceIfChannel()
      return
    }

    // 충전 시작 — X 눌리는 순간 (지상에서만)
    if (kickJustDown && onGround && this.chargeStartedAt === null) {
      this.chargeStartedAt = this.time.now
    }

    // 충전 릴리즈 — X 놓는 순간 → 실제 킥 발사 (공이 사거리 + facing 방향에 있을 때만)
    if (kickJustUp && this.chargeStartedAt !== null) {
      const heldMs = this.time.now - this.chargeStartedAt
      this.chargeStartedAt = null
      if (!onGround) {
        // 공중에서 뗀 거면 조용히 취소
      } else if (!this.ballInKickReach()) {
        // 공이 없으면 킥 anim 자체를 재생 안 함 — 그려진 공이 뿅 하고 튀어나오는 문제 방지.
        this.showMissHint()
      } else {
        const t = Math.min(heldMs / KICK_CHARGE_MAX_MS, 1)
        const speed = KICK_MIN_SPEED + (KICK_MAX_SPEED - KICK_MIN_SPEED) * t
        const angle = KICK_MIN_ANGLE_DEG + (KICK_MAX_ANGLE_DEG - KICK_MIN_ANGLE_DEG) * t
        this.state = "kicking"
        body.setAccelerationX(0)
        body.setVelocityX(0)
        body.setDragX(GROUND_DRAG)
        // kick anim 은 east 원본만 — west 쪽은 동일한 east 방향 그림이라 flipX 로 반전.
        this.player.play(animKey("kick", "east"), true)
        this.player.setFlipX(this.facing === "west")
        // 킥 중엔 physics 공 숨김 — 그려진 공과 이중 표시 방지
        this.ball.setVisible(false)
        this.pendingBallX = this.ball.x
        this.pendingBallY = this.ball.y
        this.pendingKickSpeed = speed
        this.pendingKickAngleDeg = angle
        this.updateNameTag()
        this.updateChargeBar()
        return
      }
    }

    // 좌우 입력 → facing 갱신 + 가속 (walking 중엔 instant flip, 턴 애니 X — 응답성 우선)
    if (left) {
      body.setAccelerationX(-accelValue)
      this.setFacing("west")
    } else if (right) {
      body.setAccelerationX(accelValue)
      this.setFacing("east")
    } else {
      body.setAccelerationX(0)
    }
    body.setDragX(dragValue)

    // 위/아래 화살표 — idle 상태 + 지상 + 수평 정지 시에만 정면/후면 전환 (턴 애니 포함).
    // 걷는 도중엔 무시 (방향이 이미 east/west 로 잠겨있어야 자연스러움).
    // 이 지점에선 state ∈ {idle, walking, jumping} (kicking/turning 은 이미 early return)
    const isStationary = onGround && !left && !right && Math.abs(body.velocity.x) < 20
    if (isStationary && this.state !== "jumping") {
      if (lookUpPressed) this.requestOrientation("north")
      else if (lookDownPressed) this.requestOrientation("south")
    }

    // 점프 — 지상에서 JustDown 만 (홀드로 연속 점프 방지)
    if (jumpPressed && onGround) {
      body.setVelocityY(JUMP_VELOCITY)
      this.state = "jumping"
      // 점프할 때 orientation 을 facing 으로 sync (north/south 보고 있다가 점프하면 east/west 로)
      this.orientation = this.facing
      this.player.setFlipX(false)
      this.player.play(animKey("jump", this.facing), true)
    }

    // 착지 감지: 점프 상태였는데 지상이면 idle/walk 로 복귀
    if (this.state === "jumping" && onGround && body.velocity.y >= 0) {
      this.state = "idle"
    }

    // 공중이 아닌데 jumping / turning 이 아니면 walking/idle 판정
    if (this.state !== "jumping" && this.state !== "turning") {
      this.state = onGround && Math.abs(body.velocity.x) > 10 ? "walking" : "idle"
      this.syncIdleOrWalkAnim(onGround, body.velocity.x)
    }

    this.updateNameTag()
    this.updateChargeBar()
    this.publishPresenceIfChannel()
    this.updateRemoteAvatars(deltaMs)
    this.publishBallStateIfAuthority()
  }

  /** facing (east/west) 변경 — walking 중엔 instant flip, orientation 도 같이 east/west 로 sync. */
  private setFacing(next: Facing) {
    if (this.facing === next) return
    this.facing = next
    this.orientation = next // 걷기 중엔 orientation 도 east/west 와 동일
    this.player.setFlipX(false)
    const cur = this.player.anims.currentAnim?.key ?? ""
    const m = cur.match(/(walk|jump|kick):(east|west)$/)
    if (m && this.state !== "idle") {
      const kind = m[1] as "walk" | "jump" | "kick"
      this.player.play(animKey(kind, next), true)
    } else if (this.state === "idle") {
      this.player.setTexture(texKeyRotation(next))
    }
  }

  /**
   * state === idle | walking 일 때 anim 동기화. jump/kick/turning 은 별도 분기.
   * idle 에선 orientation (8방향 중 하나) 의 rotation 텍스처를 보여줌 — 정면/후면
   * 포함 north/south 도 정상 표시.
   */
  private syncIdleOrWalkAnim(onGround: boolean, vx: number) {
    if (onGround && Math.abs(vx) > 10) {
      const walkKey = animKey("walk", this.facing)
      if (this.player.anims.currentAnim?.key !== walkKey || !this.player.anims.isPlaying) {
        this.player.play(walkKey, true)
      }
    } else {
      // idle — anim 중지 + orientation rotation 텍스처
      if (this.player.anims.isPlaying) this.player.anims.stop()
      const idleKey = texKeyRotation(this.orientation)
      if (this.player.texture.key !== idleKey) {
        this.player.setTexture(idleKey)
      }
    }
  }

  /** 정면/후면 등 orientation 변경 요청 — 이미 같거나 turning 중이면 무시. */
  private requestOrientation(target: RotationDir) {
    if (this.state === "turning") return
    if (this.orientation === target) return
    const path = rotationPath(this.orientation, target)
    if (path.length === 0) return
    this.turnPath = path
    this.turnFrameIdx = 0
    this.turnFrameTimer = 0
    this.orientation = target
    this.state = "turning"
    this.player.anims.stop()
    this.player.setFlipX(false)
    // 즉시 첫 프레임 세팅 (체감 응답성)
    this.player.setTexture(texKeyRotation(path[0]))
    this.turnFrameIdx = 1
  }

  /** 매 프레임 turn 진행 — TURN_FRAME_MS 마다 다음 rotation 으로. */
  private advanceTurn(deltaMs: number) {
    this.turnFrameTimer += deltaMs
    while (this.turnFrameTimer >= TURN_FRAME_MS && this.turnFrameIdx < this.turnPath.length) {
      this.player.setTexture(texKeyRotation(this.turnPath[this.turnFrameIdx]))
      this.turnFrameIdx++
      this.turnFrameTimer -= TURN_FRAME_MS
    }
    if (this.turnFrameIdx >= this.turnPath.length) {
      // 완료 — idle 로 복귀 (orientation 은 이미 target 에 세팅됨)
      this.state = "idle"
      this.turnPath = []
      this.turnFrameIdx = 0
    }
  }

  /** 걷기 입력이 들어와 turning 중단해야 할 때. */
  private cancelTurn() {
    this.turnPath = []
    this.turnFrameIdx = 0
    this.turnFrameTimer = 0
    this.state = "idle"
  }

  private updateNameTag() {
    this.nameTag.setPosition(this.player.x, this.player.y - AVATAR_VISUAL_H / 2 - 6)
    if (this.chatBubble && this.chatBubble.active) {
      this.chatBubble.setPosition(this.player.x, this.player.y - AVATAR_VISUAL_H / 2 - 22)
    }
  }

  // ============================================================
  // 축구공 + 킥 충전
  // ============================================================

  /** 플레이어 기준 공이 사거리 + facing 방향에 있는지. */
  private ballInKickReach(): boolean {
    const dx = this.ball.x - this.player.x
    const dist = Math.sqrt(dx * dx + (this.ball.y - this.player.y) ** 2)
    if (dist > BALL_KICK_RANGE) return false
    const sign = this.facing === "east" ? 1 : -1
    if (Math.sign(dx) !== sign && Math.abs(dx) > 5) return false
    return true
  }

  /** kick anim 완료 시 호출 — 숨겨뒀던 공을 원래 위치에서 속도·각도로 발사. */
  private applyPendingKickToBall() {
    const speed = this.pendingKickSpeed
    const angleDeg = this.pendingKickAngleDeg
    const x = this.pendingBallX
    const y = this.pendingBallY
    this.pendingKickSpeed = null
    this.pendingKickAngleDeg = null
    this.pendingBallX = null
    this.pendingBallY = null
    // 상태 복원: flipX 해제, 공 재표시
    this.player.setFlipX(false)
    this.ball.setVisible(true)
    if (speed === null || angleDeg === null || x === null || y === null) return
    // 킥 시작 시점 좌표로 복귀 (킥 중 frozen 이었으니 동일 위치). 속도 인가.
    this.ball.setPosition(x, y)
    const sign = this.facing === "east" ? 1 : -1
    const angleRad = (angleDeg * Math.PI) / 180
    const vx = sign * speed * Math.cos(angleRad)
    const vy = -speed * Math.sin(angleRad)
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    ballBody.setVelocity(vx, vy)
    // 즉시 원격에 broadcast — 내가 authority 가 됨
    this.channel?.publishBallState({ x: this.ball.x, y: this.ball.y, vx, vy }, true)
  }

  /** 공 없이 X 놓을 때 "앞에 공이 없어요" 짧은 토스트 (2초 페이드). */
  private showMissHint() {
    this.missHintText?.destroy()
    this.missHintText = this.add
      .text(this.scale.width / 2, 90, "앞에 공이 없어요 — 공 앞에서 차세요", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(103)
    this.tweens.add({
      targets: this.missHintText,
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => {
        this.missHintText?.destroy()
        this.missHintText = null
      },
    })
  }

  private updateChargeBar() {
    if (this.chargeStartedAt === null) {
      if (this.chargeBarBg.visible) {
        this.chargeBarBg.setVisible(false)
        this.chargeBarFill.setVisible(false)
      }
      return
    }
    const held = this.time.now - this.chargeStartedAt
    const t = Math.min(held / KICK_CHARGE_MAX_MS, 1)
    const maxFillW = this.chargeBarBg.width - 2
    this.chargeBarFill.width = maxFillW * t
    // 색상: 녹색(약) → 노랑(중) → 빨강(강)
    const color = t < 0.4 ? 0x4ade80 : t < 0.75 ? 0xfacc15 : 0xef4444
    this.chargeBarFill.setFillStyle(color, 1)
    this.chargeBarBg.setVisible(true)
    this.chargeBarFill.setVisible(true)
  }

  private showChatBubble(text: string) {
    // 이전 말풍선 제거 — 유저당 1개만 유지
    this.chatBubble?.destroy()
    const bubble = new ChatBubble(this, text)
    bubble.setAutoExpire(METAVERSE.BUBBLE_DURATION_MS)
    bubble.on(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.chatBubble === bubble) this.chatBubble = null
    })
    this.chatBubble = bubble
  }

  // ============================================================
  // Realtime 멀티 — presence 게시, 원격 아바타 동기화, 공·박치기 broadcast
  // ============================================================

  /** 내 PlayerState → wire 용 SideScrollerActionState 매핑 */
  private wireActionState(): SideScrollerActionState {
    switch (this.state) {
      case "walking":
        return "walking"
      case "jumping":
        return "jumping"
      case "kicking":
        return "kicking"
      case "turning":
        return "turning"
      case "headbutt":
        return "headbutt"
      case "stumbled":
      case "gettingUp":
        return "stumbled"
      case "idle":
      default:
        return "idle"
    }
  }

  private publishPresenceIfChannel() {
    if (!this.channel) return
    this.channel.publishPresence(this.player.x, this.player.y, this.facing, this.wireActionState())
  }

  private syncRemoteAvatars(remote: Map<string, SideScrollerPresence>) {
    // 추가/업데이트
    for (const [uid, presence] of remote) {
      const existing = this.remoteAvatars.get(uid)
      if (existing) {
        existing.setPresence(presence)
      } else {
        const avatar = new SideScrollerRemoteAvatar(this, presence)
        this.remoteAvatars.set(uid, avatar)
      }
    }
    // 떠난 유저 제거
    for (const [uid, avatar] of this.remoteAvatars) {
      if (!remote.has(uid)) {
        avatar.destroy()
        this.remoteAvatars.delete(uid)
        // 말풍선도 함께 제거
        const bubble = this.remoteChatBubbles.get(uid)
        if (bubble) {
          bubble.destroy()
          this.remoteChatBubbles.delete(uid)
        }
      }
    }
  }

  private updateRemoteAvatars(deltaMs: number) {
    for (const av of this.remoteAvatars.values()) av.update(deltaMs)
    // 원격 말풍선 머리 위 follow
    for (const [uid, bubble] of this.remoteChatBubbles) {
      if (!bubble.active) continue
      const av = this.remoteAvatars.get(uid)
      if (!av) continue
      bubble.setPosition(av.getX(), av.getY() - AVATAR_VISUAL_H / 2 - 22)
    }
  }

  private handleRemoteChat(msg: RoomChatMessage) {
    // 자기 자신 메시지 (self dispatch) — chat:log 에만 넣고 bubble 은 내 머리 위 showChatBubble 로 별도 처리
    const isSelf = msg.userId === this.identity.userId
    sceneBridge.emit("chat:log:append", {
      userId: msg.userId,
      nickname: msg.nickname,
      text: msg.text,
      timestamp: msg.timestamp,
      scope: "local",
    })
    if (isSelf) {
      this.showChatBubble(msg.text)
      return
    }
    // 원격 유저 머리 위 bubble
    const prev = this.remoteChatBubbles.get(msg.userId)
    if (prev) prev.destroy()
    const bubble = new ChatBubble(this, msg.text)
    bubble.setAutoExpire(METAVERSE.BUBBLE_DURATION_MS)
    bubble.on(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.remoteChatBubbles.get(msg.userId) === bubble) {
        this.remoteChatBubbles.delete(msg.userId)
      }
    })
    this.remoteChatBubbles.set(msg.userId, bubble)
  }

  /** 원격에서 공 상태 받으면 로컬 공에 덮어씀. 최신 ts 만 허용. */
  private handleRemoteBallState(state: SharedBallState) {
    // 내가 authority 면 (최근 ballLastPublishAt 의 ts > 수신 ts) 무시
    if (state.ownerId === this.identity.userId) return
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    this.ball.setPosition(state.x, state.y)
    ballBody.setVelocity(state.vx, state.vy)
  }

  /** 공이 움직이고 있으면 200ms 마다 broadcast. 마지막으로 찬 사람이 authority. */
  private publishBallStateIfAuthority() {
    if (!this.channel) return
    if (!this.ball.visible) return
    const body = this.ball.body as Phaser.Physics.Arcade.Body
    // velocity 가 유의미 할 때만. 멈춰있으면 더 이상 안 보냄.
    if (Math.abs(body.velocity.x) < 2 && Math.abs(body.velocity.y) < 2) return
    this.channel.publishBallState({
      x: this.ball.x,
      y: this.ball.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
    })
    this.ballLastPublishAt = this.time.now
  }

  /** 박치기 맞음 — knock-back + stumble 상태로 진입. */
  private handleHeadbuttHit(evt: HeadbuttHitEvent) {
    if (evt.targetUserId !== this.identity.userId) return // 나 아님
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setVelocityX(evt.knockbackVx)
    body.setVelocityY(-200) // 살짝 뜸
    this.state = "stumbled"
    this.stumbleEndsAt = this.time.now + STUMBLE_DURATION_MS
    // stumble anim 재생 (있으면)
    if (this.player.anims.exists(animKey("stumble", "east"))) {
      this.player.play(animKey("stumble", "east"), true)
      this.player.setFlipX(this.facing === "east") // 맞고 쓰러질 때 반대 방향 보임
    }
  }

  private teardown() {
    this.unsubChatSend?.()
    this.unsubChatOpen?.()
    this.unsubChatClose?.()
    this.unsubChatSend = null
    this.unsubChatOpen = null
    this.unsubChatClose = null
    this.unsubRemote?.()
    this.unsubRemoteChat?.()
    this.unsubBallState?.()
    this.unsubHeadbuttHit?.()
    this.unsubRemote = null
    this.unsubRemoteChat = null
    this.unsubBallState = null
    this.unsubHeadbuttHit = null
    this.chatBubble?.destroy()
    this.chatBubble = null
    for (const av of this.remoteAvatars.values()) av.destroy()
    this.remoteAvatars.clear()
    for (const b of this.remoteChatBubbles.values()) b.destroy()
    this.remoteChatBubbles.clear()
  }
}
