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
 * 배경: `public/metaverse/bg-stadium.webp` (1916×821) — 경기장 전면부
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
  RoomChatMessage,
  SideScrollerPresence,
} from "@/lib/metaverse/types"
import type { SideScrollerChannel } from "@/lib/metaverse/realtime/sidescroll-channel"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import {
  preloadAllAvatarPresets,
  createAllAvatarAnimations,
  texKeyIdle,
  texKeyRotation,
  rotationPath,
  animKey,
  TURN_FRAME_MS,
  type Facing,
  type RotationDir,
} from "@/lib/metaverse/avatar/pro-avatar-xl"
import { DEFAULT_AVATAR_KEY, getAvatarPreset } from "@/lib/metaverse/avatar/presets"
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

// 씬 크기 — 배경 이미지(bg-stadium.webp 1916×821)와 정확히 일치.
const SCENE_WIDTH = 1916
const SCENE_HEIGHT = 821
// 바닥선 — 배경 이미지의 전면 잔디(꽃 있는 라인) 가 시작되는 y.
// 이 y 부터 캐릭터가 "서있는" 면. 아래쪽 돌벽/아치 영역은 보이지만
// 캐릭터는 그 위 잔디에서 좌우 이동.
const FLOOR_TOP_Y = 640
const FLOOR_HEIGHT = SCENE_HEIGHT - FLOOR_TOP_Y

// PixelLab pro frame → 1.0 scale (정수배, pixelArt 에서 가장 크리스프).
// 기본 프리셋(default-pro-xl) 208×208, 캐릭터 픽셀 34×98. 다른 프리셋도 canvas 폭만 다르지
// 픽셀아트 느낌 유지 위해 공통 정수 배율 유지. 프리셋별 hitbox 는 presets.ts 에서 참조.
const AVATAR_SCALE = 1.0

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
// 공이 이 반경 안에 있으면 킥 가능. 넉넉하게 120px — 플레이어 어깨/몸통 근처만 가도 찰 수 있음.
// facing 방향 엄격 체크는 제거됨 (뒤에 있는 공도 찰 수 있고, 킥 방향은 무조건 facing).
const BALL_KICK_RANGE = 120
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
// 1916×821 stadium 일러스트 — webp q=80 으로 압축 (PNG 2.2MB → webp 221KB, 시각 거의 동일).
const BG_URL = "/metaverse/bg-stadium.webp"

type PlayerState = "idle" | "walking" | "jumping" | "kicking" | "turning"

export class SideScrollerScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  /** 로컬 플레이어가 쓰는 아바타 프리셋 키. 원격은 각자의 presence.avatarKey 를 씀. */
  private presetKey: string = DEFAULT_AVATAR_KEY
  /** 로컬 플레이어 아바타 시각 높이 (스케일 적용) — 닉네임/말풍선 오프셋 계산용. */
  private avatarVisualH: number = 98
  /** 로컬 플레이어 프리셋의 kick 재생 중 임시 스케일 배수. 1.0 이면 무보정. */
  private presetKickScale: number = 1
  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private rKey!: Phaser.Input.Keyboard.Key
  private platforms!: Phaser.Physics.Arcade.StaticGroup

  /** Realtime 채널 — 없으면 (데모 스탠드얼론) 싱글플레이 fallback */
  private channel: SideScrollerChannel | null = null
  /** 원격 유저 스프라이트 맵 — userId 키로 생성·삭제 */
  private remoteAvatars: Map<string, SideScrollerRemoteAvatar> = new Map()
  /** 원격 유저 말풍선 — userId 키 (공간이 좁아 proximity 필터 X, 전부 보여줌) */
  private remoteChatBubbles: Map<string, ChatBubble> = new Map()
  /** 채널 구독 해제 함수들 */
  private unsubRemote: (() => void) | null = null
  private unsubRemoteChat: (() => void) | null = null
  private unsubBallState: (() => void) | null = null
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
  /** 마지막으로 sceneBridge 에 emit 한 charge state — React HUD spam 방지용 */
  private lastChargeEmitted: { active: boolean; progress: number } = { active: false, progress: 0 }
  /** 발먼지 파티클 — 걷기 시 발 아래에 작은 puff 발사 */
  private footDust!: Phaser.GameObjects.Particles.ParticleEmitter
  /** 마지막 onGround 상태 — 착지 임팩트 트리거용 */
  private wasOnGround = true
  /** 충전 시 좌우 떨림 보정값 — update 매 프레임 player.x 에 추가 */
  private chargeShakeOffset = 0
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
    this.presetKey = data.identity.avatarKey ?? DEFAULT_AVATAR_KEY
  }

  preload() {
    if (!this.textures.exists(BG_TEXTURE)) {
      this.load.image(BG_TEXTURE, BG_URL)
    }
    if (!this.textures.exists(BALL_TEXTURE)) {
      this.load.image(BALL_TEXTURE, BALL_URL)
    }
    // 원격 유저의 다양한 프리셋 지원 위해 전체 프리셋 선로딩.
    preloadAllAvatarPresets(this)
  }

  create() {
    // 월드 경계 + 중력 (이 씬 로컬 중력 — 월드맵 씬에 영향 없음)
    this.physics.world.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    this.physics.world.gravity.y = GRAVITY_Y

    // 배경 이미지 — 하늘/경기장/전경 모두 포함한 단일 일러스트.
    // scrollFactor 1 (디폴트) 로 카메라 팬 그대로 따라감.
    this.cameras.main.setBackgroundColor("#87ceeb") // 로드 실패 시 하늘색 fallback
    this.add.image(0, 0, BG_TEXTURE).setOrigin(0, 0).setDepth(0)

    // 분위기 레이어 — 구름·스타디움 라이트·전경 잔디. 새 에셋 0, 모두 Phaser graphics.
    this.createAtmosphereLayers()

    // 보이지 않는 바닥 콜리전 — 배경 이미지의 전경(잔디·돌벽) 위에 캐릭터가 서도록.
    // 디버그 하고 싶을 땐 fillColor 를 0x00ff00, alpha 0.3 으로 일시 변경.
    this.platforms = this.physics.add.staticGroup()
    const invisibleFloor = this.add
      .rectangle(0, FLOOR_TOP_Y, SCENE_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
    this.platforms.add(invisibleFloor)

    // walk / jump / kick anim 등록 — 모든 프리셋에 대해 (원격 유저들의 다양한 외형 대응)
    createAllAvatarAnimations(this)

    const preset = getAvatarPreset(this.presetKey)
    // 플레이어 스프라이트 — 초기 east idle. 프리셋별 스프라이트.
    this.player = this.physics.add.sprite(
      100,
      FLOOR_TOP_Y - 100,
      texKeyIdle("east", this.presetKey)
    )
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
    // 아웃라인 glow — 배경과 캐릭터 분리를 위한 다크 할로.
    // Phaser 4: `enableFilters()` 먼저 호출 → `filters.internal.addGlow(...)`.
    // color=검정, outerStrength=4 (두께), innerStrength=0, scale=1, knockout=false, quality=0.1, distance=8.
    this.player.enableFilters()
    this.player.filters?.internal.addGlow(0x000000, 4, 0, 1, false, 0.1, 8)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setMaxVelocity(WALK_SPEED, MAX_FALL_SPEED)
    // hitbox 는 캐릭터 몸통 근처만 — 투명 패딩 영역이 벽에 걸리는 느낌 방지
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setSize(preset.bodyWidth, preset.bodyHeight)
    playerBody.setOffset(preset.bodyOffsetX, preset.bodyOffsetY)
    // 드래그는 update()에서 지면/공중 상황에 따라 갱신
    this.physics.add.collider(this.player, this.platforms)

    // 발먼지 파티클 — 걷기 시 follow, on()/off() 로 토글
    this.footDust = this.createFootDustEmitter()

    // kick 완료 → state 복귀 + 대기 중이던 공 속도 인가.
    // 중요: anim 완료 시 Phaser 는 last frame 에 머무름 (kick frame_003 에 공이
    // 그려져있으면 그대로 stuck). `syncIdleOrWalkAnim` 은 `anims.isPlaying` 이
    // true 일 때만 idle 텍스처 세팅 → complete 후엔 발동 X. 직접 idle texture 로
    // 리셋해 그려진 공이 남는 문제 방지.
    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        const key = anim.key
        if (
          key === animKey("kick", "east", this.presetKey) ||
          key === animKey("kick", "west", this.presetKey)
        ) {
          this.applyPendingKickToBall()
          this.state = "idle"
          this.orientation = this.facing
          this.player.setTexture(texKeyRotation(this.facing, this.presetKey))
          this.player.setFlipX(false)
          // kick 중 적용한 임시 스케일 복원
          this.player.setScale(AVATAR_SCALE)
        }
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

    // 닉네임 태그 — 프리셋 높이 기준 (frameHeight 가 아니라 실제 bodyHeight 로 계산)
    this.avatarVisualH = preset.bodyHeight * AVATAR_SCALE
    this.presetKickScale = preset.kickScale ?? 1
    this.nameTag = this.add
      .text(this.player.x, this.player.y - this.avatarVisualH / 2 - 6, this.identity.nickname, {
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
    // 액션 키: Space = 점프, R = 킥 (홀드 충전)
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)

    // 카메라 follow + 월드 경계
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)

    // 안내·HUD 는 React `<MetaverseHud>` 가 캔버스 위에 오버레이로 그림.
    // Phaser 안에서는 게임 월드 (캐릭터·공·배경) 만 다룬다.

    // 충전 게이지 시각화는 React HUD `<HudChargeBar>` 가 sceneBridge "charge:progress"
    // 이벤트를 받아 그림. 여기선 게임 로직만 (chargeStartedAt 상태).

    // Realtime 채널 구독 — 원격 유저·공 이벤트
    if (this.channel) {
      this.channel.setInitialPosition(this.player.x, this.player.y)
      this.unsubRemote = this.channel.onRemoteChange((remote) => this.syncRemoteAvatars(remote))
      this.unsubRemoteChat = this.channel.onChatMessage((msg) => this.handleRemoteChat(msg))
      this.unsubBallState = this.channel.onBallState((state) => this.handleRemoteBallState(state))
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
    // Space = 점프. ↑/W = 뒤보기, ↓/S = 앞보기. R 은 킥 충전.
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey)
    const lookUpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W)
    const lookDownPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.down!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.S)
    // R = 킥 (hold 충전, release 발사)
    const kickJustDown = Phaser.Input.Keyboard.JustDown(this.rKey)
    const kickJustUp = Phaser.Input.Keyboard.JustUp(this.rKey)

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
        this.player.play(animKey("kick", "east", this.presetKey), true)
        this.player.setFlipX(this.facing === "west")
        // 프리셋별 kickScale 보정 — PixelLab 커스텀 kick 이 idle 대비 과하게 큰 경우 스케일 다운.
        this.player.setScale(AVATAR_SCALE * this.presetKickScale)
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
      this.player.play(animKey("jump", this.facing, this.presetKey), true)
      // juice: squash & stretch
      this.playJumpSquash()
    }

    // 착지 감지: 점프 상태였는데 지상이면 idle/walk 로 복귀 + 임팩트 효과
    if (this.state === "jumping" && onGround && body.velocity.y >= 0) {
      this.state = "idle"
      this.playLandingImpact()
    }
    // 공중→지상 transition 전체 감지 (점프 외 추락 포함)
    if (!this.wasOnGround && onGround) {
      // 이미 위 분기에서 jumping 케이스는 처리됨 — 추락만 추가 임팩트
      if (this.state !== "jumping") this.playLandingImpact()
    }
    this.wasOnGround = onGround

    // 공중이 아닌데 jumping / turning 이 아니면 walking/idle 판정
    if (this.state !== "jumping" && this.state !== "turning") {
      this.state = onGround && Math.abs(body.velocity.x) > 10 ? "walking" : "idle"
      this.syncIdleOrWalkAnim(onGround, body.velocity.x)
    }

    // juice: 걸을 때 발먼지 + 충전 시 떨림
    this.updateFootDust(onGround, body.velocity.x)
    this.updateChargeShake()

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
      this.player.play(animKey(kind, next, this.presetKey), true)
    } else if (this.state === "idle") {
      this.player.setTexture(texKeyRotation(next, this.presetKey))
    }
  }

  /**
   * state === idle | walking 일 때 anim 동기화. jump/kick/turning 은 별도 분기.
   * idle 에선 orientation (8방향 중 하나) 의 rotation 텍스처를 보여줌 — 정면/후면
   * 포함 north/south 도 정상 표시.
   */
  private syncIdleOrWalkAnim(onGround: boolean, vx: number) {
    if (onGround && Math.abs(vx) > 10) {
      const walkKey = animKey("walk", this.facing, this.presetKey)
      if (this.player.anims.currentAnim?.key !== walkKey || !this.player.anims.isPlaying) {
        this.player.play(walkKey, true)
      }
    } else {
      // idle — anim 중지 + orientation rotation 텍스처
      if (this.player.anims.isPlaying) this.player.anims.stop()
      const idleKey = texKeyRotation(this.orientation, this.presetKey)
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
    this.player.setTexture(texKeyRotation(path[0], this.presetKey))
    this.turnFrameIdx = 1
  }

  /** 매 프레임 turn 진행 — TURN_FRAME_MS 마다 다음 rotation 으로. */
  private advanceTurn(deltaMs: number) {
    this.turnFrameTimer += deltaMs
    while (this.turnFrameTimer >= TURN_FRAME_MS && this.turnFrameIdx < this.turnPath.length) {
      this.player.setTexture(texKeyRotation(this.turnPath[this.turnFrameIdx], this.presetKey))
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
    this.nameTag.setPosition(this.player.x, this.player.y - this.avatarVisualH / 2 - 6)
    if (this.chatBubble && this.chatBubble.active) {
      this.chatBubble.setPosition(this.player.x, this.player.y - this.avatarVisualH / 2 - 22)
    }
  }

  // ============================================================
  // 축구공 + 킥 충전
  // ============================================================

  /** 플레이어 기준 공이 `BALL_KICK_RANGE` 반경 안에 있는지.
   * facing 방향 엄격 체크는 제거됨 — 뒤에 있는 공도 찰 수 있고 킥 방향은 무조건 facing. */
  private ballInKickReach(): boolean {
    const dx = this.ball.x - this.player.x
    const dy = this.ball.y - this.player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    return dist <= BALL_KICK_RANGE
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
    // juice: 임팩트 라인 burst at 공 출발점
    this.playKickImpact(x, y, sign as 1 | -1)
    // 즉시 원격에 broadcast — 내가 authority 가 됨
    this.channel?.publishBallState({ x: this.ball.x, y: this.ball.y, vx, vy }, true)
  }

  /** 공이 사거리 밖일 때 R 놓으면 뜨는 짧은 토스트 (2초 페이드). */
  private showMissHint() {
    this.missHintText?.destroy()
    this.missHintText = this.add
      .text(this.scale.width / 2, 90, "공이 너무 멀어요 — 가까이 가서 차세요", {
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

  /** 충전 진행도를 React HUD 로 emit. 매 프레임 호출되지만 값이 바뀐 경우만 dispatch. */
  private updateChargeBar() {
    const active = this.chargeStartedAt !== null
    const progress = active
      ? Math.min((this.time.now - this.chargeStartedAt!) / KICK_CHARGE_MAX_MS, 1)
      : 0
    const last = this.lastChargeEmitted
    // 활성 상태 변화 OR 진행도 4% 이상 변화 시에만 emit (React re-render 절약)
    if (last.active !== active || Math.abs(last.progress - progress) > 0.04) {
      this.lastChargeEmitted = { active, progress }
      sceneBridge.emit("charge:progress", { active, progress })
    }
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
      bubble.setPosition(av.getX(), av.getY() - this.avatarVisualH / 2 - 22)
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

  /** 공이 움직이고 있으면 200ms 마다 broadcast. 지면 안착 + 수평 속도 미미하면 중단. */
  private publishBallStateIfAuthority() {
    if (!this.channel) return
    if (!this.ball.visible) return
    const body = this.ball.body as Phaser.Physics.Arcade.Body
    // 지면에 안착했고 수평 드리프트도 미미하면 broadcast 중단.
    // 수직은 중력 vs 콜리더로 미세 진동 남아있어 체크 제외 (blocked.down 으로 판정).
    const isAtRest = body.blocked.down && Math.abs(body.velocity.x) < 5
    if (isAtRest) return
    this.channel.publishBallState({
      x: this.ball.x,
      y: this.ball.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
    })
    this.ballLastPublishAt = this.time.now
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
    this.unsubRemote = null
    this.unsubRemoteChat = null
    this.unsubBallState = null
    this.chatBubble?.destroy()
    this.chatBubble = null
    for (const av of this.remoteAvatars.values()) av.destroy()
    this.remoteAvatars.clear()
    for (const b of this.remoteChatBubbles.values()) b.destroy()
    this.remoteChatBubbles.clear()
  }

  // ============================================================
  // 분위기 레이어 — 구름·라이트·잔디. 모두 Phaser graphics, 새 에셋 0.
  // depth 정렬: bg(0) → 구름(1) → 스타디움 라이트(2) → 전경 잔디(15) → 캐릭터(10)
  // ============================================================

  /** 분위기 레이어 한 번에 생성 — 구름 5개 (drift), 스타디움 라이트 4개 (pulse), 전경 잔디 산재 */
  private createAtmosphereLayers() {
    // 1) 구름 5개 — 화면 상단 sky 영역에 흰색 둥근 사각형, 좌→우 슬로 드리프트
    const cloudConfigs = [
      { x: 200, y: 80, w: 110, h: 32, dur: 60000 },
      { x: 600, y: 130, w: 90, h: 26, dur: 75000 },
      { x: 1100, y: 60, w: 140, h: 38, dur: 55000 },
      { x: 1500, y: 110, w: 80, h: 24, dur: 70000 },
      { x: 1800, y: 90, w: 120, h: 30, dur: 65000 },
    ]
    for (const c of cloudConfigs) {
      const cloud = this.add
        .rectangle(c.x, c.y, c.w, c.h, 0xffffff, 0.55)
        .setOrigin(0.5, 0.5)
        .setDepth(1)
        .setScrollFactor(0.4) // 카메라보다 천천히 = 멀리 있는 느낌
      // 둥근 모서리 시뮬레이션 — 양 끝에 작은 원 추가
      const leftCap = this.add
        .circle(c.x - c.w / 2, c.y, c.h / 2, 0xffffff, 0.55)
        .setDepth(1)
        .setScrollFactor(0.4)
      const rightCap = this.add
        .circle(c.x + c.w / 2, c.y, c.h / 2, 0xffffff, 0.55)
        .setDepth(1)
        .setScrollFactor(0.4)
      // 드리프트 애니
      this.tweens.add({
        targets: [cloud, leftCap, rightCap],
        x: `+=${SCENE_WIDTH + c.w + 200}`,
        duration: c.dur,
        repeat: -1,
        ease: "Linear",
        onRepeat: () => {
          cloud.x = -c.w
          leftCap.x = cloud.x - c.w / 2
          rightCap.x = cloud.x + c.w / 2
        },
      })
    }

    // 2) 스타디움 라이트 4개 — 상단 양쪽에 노란 glow 펄스
    const lightConfigs = [
      { x: 250, y: 50 },
      { x: 750, y: 50 },
      { x: 1250, y: 50 },
      { x: 1700, y: 50 },
    ]
    for (const l of lightConfigs) {
      const glow = this.add.circle(l.x, l.y, 28, 0xfff0a0, 0.35).setDepth(2).setScrollFactor(0.7) // 약간 깊이감
      const inner = this.add.circle(l.x, l.y, 12, 0xffffff, 0.85).setDepth(2).setScrollFactor(0.7)
      // 펄스 — 알파가 천천히 호흡 (sin wave 효과)
      this.tweens.add({
        targets: glow,
        alpha: 0.2,
        duration: 1800 + Math.random() * 600, // 살짝 어긋나게
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      })
      this.tweens.add({
        targets: inner,
        scale: 0.85,
        duration: 1800 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      })
    }

    // 3) 전경 잔디 — 바닥 라인 따라 작은 녹색 삼각형 산재. 캐릭터 발 근처 디테일.
    const grassY = FLOOR_TOP_Y + 6
    for (let x = 0; x < SCENE_WIDTH; x += 35 + Math.random() * 25) {
      const w = 4 + Math.random() * 3
      const h = 8 + Math.random() * 6
      const g = this.add.triangle(x, grassY, 0, 0, w, -h, w * 2, 0, 0x4ade80, 0.85)
      g.setDepth(15) // 캐릭터(10) 보다 위 — 전경 디테일
      g.setOrigin(0, 1)
      // 살짝 흔들림 (바람 효과)
      this.tweens.add({
        targets: g,
        scaleX: { from: 1, to: 1.05 },
        scaleY: { from: 1, to: 0.95 },
        duration: 2200 + Math.random() * 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      })
    }
  }

  // ============================================================
  // 캐릭터 juice — 발먼지·점프 squash·착지 임팩트·충전 떨림
  // ============================================================

  private createFootDustEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    // 작은 흰색/회색 원 텍스처가 없으니 1×1 화이트 픽셀을 동적으로 만들어 사용
    const key = "ss-dust-particle"
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(4, 4, 4)
      g.generateTexture(key, 8, 8)
      g.destroy()
    }
    const emitter = this.add.particles(0, 0, key, {
      lifespan: 450,
      speedY: { min: -30, max: -10 },
      speedX: { min: -25, max: 25 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.5, end: 0 },
      tint: 0xc8b88a, // 모래 색
      frequency: -1, // 수동 emit
      gravityY: 60,
      blendMode: "NORMAL",
    })
    emitter.setDepth(8) // 캐릭터(10) 뒤
    return emitter
  }

  /** 매 update 호출 — 걸을 때 발 밑에 dust spawn */
  private updateFootDust(onGround: boolean, vx: number) {
    if (!onGround || Math.abs(vx) < 50 || this.state === "kicking") return
    // 약 80ms 마다 1개 puff
    if ((this.time.now | 0) % 80 < 20) {
      const px = this.player.x + (vx > 0 ? -8 : 8)
      const py = this.player.y + this.avatarVisualH / 2 - 2
      this.footDust.emitParticle(1, px, py)
    }
  }

  /** 점프 시작 시 squash → stretch */
  private playJumpSquash() {
    this.tweens.killTweensOf(this.player)
    this.player.scaleX = AVATAR_SCALE * 1.15
    this.player.scaleY = AVATAR_SCALE * 0.85
    this.tweens.add({
      targets: this.player,
      scaleX: AVATAR_SCALE * 0.9,
      scaleY: AVATAR_SCALE * 1.1,
      duration: 120,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.player,
          scaleX: AVATAR_SCALE,
          scaleY: AVATAR_SCALE,
          duration: 200,
          ease: "Sine.easeInOut",
        })
      },
    })
  }

  /** 착지 임팩트 — squish + 먼지 burst */
  private playLandingImpact() {
    this.tweens.killTweensOf(this.player)
    this.player.scaleX = AVATAR_SCALE * 1.2
    this.player.scaleY = AVATAR_SCALE * 0.8
    this.tweens.add({
      targets: this.player,
      scaleX: AVATAR_SCALE,
      scaleY: AVATAR_SCALE,
      duration: 180,
      ease: "Back.easeOut",
    })
    // 좌우로 dust burst 3-4개
    const px = this.player.x
    const py = this.player.y + this.avatarVisualH / 2 - 2
    for (let i = 0; i < 5; i++) {
      this.footDust.emitParticle(1, px + (Math.random() - 0.5) * 30, py)
    }
  }

  /** 충전 중 좌우 작은 떨림 — 매 update 호출 */
  private updateChargeShake() {
    const charging = this.chargeStartedAt !== null
    if (!charging) {
      if (this.chargeShakeOffset !== 0) {
        // 떨림 끝나면 원위치 복귀 (sprite 위치 직접 보정 X — 다음 프레임에 자연 복귀)
        this.chargeShakeOffset = 0
      }
      return
    }
    // 충전 진행도에 비례해 떨림 진폭 증가 (0 → 2px)
    const t = Math.min((this.time.now - this.chargeStartedAt!) / KICK_CHARGE_MAX_MS, 1)
    const amp = 0.5 + t * 1.5
    const newOffset = (Math.random() - 0.5) * amp * 2
    // 이전 offset 차분만큼 sprite 이동 — physics body 와 분리하기 위해 visual offset 만 누적
    const delta = newOffset - this.chargeShakeOffset
    this.player.x += delta
    this.chargeShakeOffset = newOffset
  }

  /** 킥 임팩트 — 공이 발사될 때 임팩트 라인 + flash */
  private playKickImpact(x: number, y: number, sign: 1 | -1) {
    // 짧은 흰색 line burst — graphics 로 그렸다 fade
    const g = this.add.graphics()
    g.lineStyle(2, 0xffffff, 0.9)
    for (let i = 0; i < 4; i++) {
      const angle = (-25 + i * 17) * (Math.PI / 180)
      const len = 24 + Math.random() * 8
      g.lineBetween(x, y, x + Math.cos(angle) * len * sign, y + Math.sin(angle) * len)
    }
    g.setDepth(11)
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 220,
      ease: "Cubic.easeOut",
      onComplete: () => g.destroy(),
    })
  }
}
