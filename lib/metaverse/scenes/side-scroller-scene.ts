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
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import {
  preloadProAvatarXl,
  createProAvatarXlAnimations,
  texKeyIdle,
  animKey,
  type Facing,
} from "@/lib/metaverse/avatar/pro-avatar-xl"
import { ChatBubble } from "./chat-bubble"

export const SIDE_SCROLLER_SCENE_KEY = "MetaverseSideScroller"

// 물리 상수 — 메이플/플랫포머 느낌 튜닝용. 숫자 바꾸면 감각 즉시 달라짐.
const GRAVITY_Y = 900
// 점프 최대 높이 ≈ v²/(2g) = 320²/1800 ≈ 57px (캐릭터 display 높이의 ~1배).
// 이전 -440 은 107px (~1.7배) 이라 둥둥 뜨는 느낌이었음.
const JUMP_VELOCITY = -320
const WALK_SPEED = 240 // 최대 수평 속도 (px/s)
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

// PixelLab 208×208 XL 프레임 → 0.5 스케일 = 104×104 디스플레이.
// PIL 로 실제 픽셀 bbox 측정한 값: 캐릭터는 x=86-120 (34 wide), y=60-158 (98 tall)
// 에 그려져 있고 y=158 아래로 50px 투명 패딩이 있어 예전 offset 은 캐릭터가
// floor 위 ~50px 떠있는 느낌이었음. 지금은 발끝이 body 바닥과 정확히 일치.
const AVATAR_SCALE = 0.5
const AVATAR_BODY_W = 34
const AVATAR_BODY_H = 98
const AVATAR_BODY_OFFSET_X = 86
const AVATAR_BODY_OFFSET_Y = 60
// 시각 높이 (스케일 적용) — 닉네임/말풍선 오프셋 계산용
const AVATAR_VISUAL_H = AVATAR_BODY_H * AVATAR_SCALE

// 축구공 — 땅에 멈춰있다가 킥 입력 시 충전된 강도로 날아감.
const BALL_TEXTURE = "ss-soccer-ball"
const BALL_RADIUS = 10 // 디스플레이 반지름 (픽셀)
const BALL_GRAVITY = 900 // 플레이어와 동일
const BALL_BOUNCE = 0.35
const BALL_DRAG_X = 180 // 지상 구름 마찰
const BALL_KICK_RANGE = 60 // 플레이어 발끝 ~ 공 거리가 이 이내일 때만 실제 킥 속도 인가
const BALL_RESPAWN_X = SCENE_WIDTH / 2
const BALL_RESPAWN_Y = FLOOR_TOP_Y - 40

// 충전 게이지 — X 키 홀드 시간 → 킥 속도.
const KICK_ANGLE_DEG = 30 // 수평 대비 발사각 (고정)
const KICK_MIN_SPEED = 400 // 탭 최소 속도 (px/s) → 거리 ~154px
const KICK_MAX_SPEED = 900 // 풀차지 최대 속도 (px/s) → 거리 ~779px
const KICK_CHARGE_MAX_MS = 1200 // 이 시간 이상 홀드해도 더 안 세짐

const BG_TEXTURE = "ss-bg-stadium"
const BG_URL = "/metaverse/bg-stadium.png"

type PlayerState = "idle" | "walking" | "jumping" | "kicking"

export class SideScrollerScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private kickKey!: Phaser.Input.Keyboard.Key
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  /** 방향은 east/west (XL 스프라이트가 두 방향 독립 생성 — flipX 대신 정방향 사용). */
  private facing: Facing = "east"
  private state: PlayerState = "idle"

  // 축구공 + 충전 게이지
  private ball!: Phaser.Physics.Arcade.Sprite
  private resetKey!: Phaser.Input.Keyboard.Key
  private chargeStartedAt: number | null = null // X 키 누른 시각 (ms). null 이면 충전 안 중.
  private chargeBarBg!: Phaser.GameObjects.Rectangle
  private chargeBarFill!: Phaser.GameObjects.Rectangle
  /** 다음 kick anim 완료 시 공에 적용할 속도 (facing + charge 로 계산). */
  private pendingKickSpeed: number | null = null

  // 채팅 — 데모 모드 (로컬 bubble 만, 서버 없음)
  private chatBubble: ChatBubble | null = null
  private isChatInputOpen = false
  private unsubChatSend: (() => void) | null = null
  private unsubChatOpen: (() => void) | null = null
  private unsubChatClose: (() => void) | null = null

  constructor() {
    super(SIDE_SCROLLER_SCENE_KEY)
  }

  init(data: { identity: MetaversePlayerIdentity }) {
    this.identity = data.identity
  }

  preload() {
    if (!this.textures.exists(BG_TEXTURE)) {
      this.load.image(BG_TEXTURE, BG_URL)
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

    // kick 완료 → state 복귀 + 대기 중이던 공 속도 인가
    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (anim.key === animKey("kick", "east") || anim.key === animKey("kick", "west")) {
          this.applyPendingKickToBall()
          this.state = "idle"
        }
      }
    )

    // 축구공 — 항상 땅에 존재, 킥 입력 시에만 속도 인가.
    this.createBallTexture()
    this.ball = this.physics.add.sprite(BALL_RESPAWN_X, BALL_RESPAWN_Y, BALL_TEXTURE)
    this.ball.setDepth(9)
    this.ball.setCollideWorldBounds(true)
    this.ball.setBounce(BALL_BOUNCE)
    this.ball.setDragX(BALL_DRAG_X)
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    ballBody.setCircle(BALL_RADIUS)
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
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.kickKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)

    // 카메라 follow + 월드 경계
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)

    // 안내 (UI 오버레이)
    this.add
      .text(16, 16, "← → 이동 · Space 점프 · X 킥 (홀드로 충전) · R 공 리셋 · Enter 채팅", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
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

    // 채팅 브리지 구독 — React ChatOverlay 가 이벤트 보냄
    this.unsubChatOpen = sceneBridge.on("chat:input:open", () => {
      this.isChatInputOpen = true
    })
    this.unsubChatClose = sceneBridge.on("chat:input:close", () => {
      this.isChatInputOpen = false
    })
    this.unsubChatSend = sceneBridge.on("chat:send", (payload) => {
      if (!payload?.text) return
      // 데모는 서버 없음 — 자기 자신 메시지를 로그에도 직접 넣음
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

  update() {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const onGround = body.blocked.down

    // R 키 — 공 리셋 (어느 상태에서든 먼저 체크)
    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.resetBall()
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
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W) ||
      Phaser.Input.Keyboard.JustDown(this.spaceKey)
    const kickJustDown = Phaser.Input.Keyboard.JustDown(this.kickKey)
    const kickJustUp = Phaser.Input.Keyboard.JustUp(this.kickKey)

    // 충전 시작 — X 눌리는 순간 (지상에서만)
    if (kickJustDown && onGround && this.chargeStartedAt === null) {
      this.chargeStartedAt = this.time.now
    }

    // 충전 릴리즈 — X 놓는 순간 → 실제 킥 발사
    if (kickJustUp && this.chargeStartedAt !== null) {
      const heldMs = this.time.now - this.chargeStartedAt
      this.chargeStartedAt = null
      if (onGround) {
        const t = Math.min(heldMs / KICK_CHARGE_MAX_MS, 1)
        const speed = KICK_MIN_SPEED + (KICK_MAX_SPEED - KICK_MIN_SPEED) * t
        this.state = "kicking"
        body.setAccelerationX(0)
        body.setVelocityX(0)
        body.setDragX(GROUND_DRAG)
        this.player.play(animKey("kick", this.facing), true)
        this.pendingKickSpeed = speed
        this.updateNameTag()
        this.updateChargeBar()
        return
      }
    }

    // 좌우 입력 → facing 갱신 + 가속
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

    // 점프 — 지상에서 JustDown 만 (홀드로 연속 점프 방지)
    if (jumpPressed && onGround) {
      body.setVelocityY(JUMP_VELOCITY)
      this.state = "jumping"
      this.player.play(animKey("jump", this.facing), true)
    }

    // 착지 감지: 점프 상태였는데 지상이면 idle/walk 로 복귀
    if (this.state === "jumping" && onGround && body.velocity.y >= 0) {
      this.state = "idle"
    }

    // 공중이 아닌데 jumping 이 아니면 walking/idle 판정
    if (this.state !== "jumping") {
      this.state = onGround && Math.abs(body.velocity.x) > 10 ? "walking" : "idle"
      this.syncIdleOrWalkAnim(onGround, body.velocity.x)
    }

    this.updateNameTag()
    this.updateChargeBar()
  }

  /** facing 변경 시 현재 재생 중 anim 도 같은 종류의 반대 방향 키로 교체. */
  private setFacing(next: Facing) {
    if (this.facing === next) return
    this.facing = next
    const cur = this.player.anims.currentAnim?.key ?? ""
    // cur 은 "avatar-pro-xl-{kind}:{east|west}" 포맷
    const m = cur.match(/(walk|jump|kick):(east|west)$/)
    if (m && this.state !== "idle") {
      const kind = m[1] as "walk" | "jump" | "kick"
      this.player.play(animKey(kind, next), true)
    } else if (this.state === "idle") {
      this.player.setTexture(texKeyIdle(next))
    }
  }

  /** state === idle | walking 일 때 anim 동기화. jump/kick 은 별도 분기에서 처리. */
  private syncIdleOrWalkAnim(onGround: boolean, vx: number) {
    if (onGround && Math.abs(vx) > 10) {
      const walkKey = animKey("walk", this.facing)
      if (this.player.anims.currentAnim?.key !== walkKey || !this.player.anims.isPlaying) {
        this.player.play(walkKey, true)
      }
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(texKeyIdle(this.facing))
    }
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

  /** 8×8 흑백 격자 패턴의 간단한 축구공 텍스처. 추후 PixelLab 스프라이트로 교체 가능. */
  private createBallTexture() {
    if (this.textures.exists(BALL_TEXTURE)) return
    const g = this.add.graphics()
    const r = BALL_RADIUS
    // 흰 바디
    g.fillStyle(0xffffff, 1)
    g.fillCircle(r, r, r)
    // 검은 오각형 패턴 (상하좌우 4개)
    g.fillStyle(0x111111, 1)
    g.fillRect(r - 2, 1, 4, 4)
    g.fillRect(r - 2, r * 2 - 5, 4, 4)
    g.fillRect(1, r - 2, 4, 4)
    g.fillRect(r * 2 - 5, r - 2, 4, 4)
    // 외곽선
    g.lineStyle(1, 0x000000, 1)
    g.strokeCircle(r, r, r)
    g.generateTexture(BALL_TEXTURE, r * 2, r * 2)
    g.destroy()
  }

  /** 킥 anim 완료 시 호출 — 플레이어가 공 근처면 저장된 speed 로 공 발사. */
  private applyPendingKickToBall() {
    const speed = this.pendingKickSpeed
    this.pendingKickSpeed = null
    if (speed === null) return
    const dx = this.ball.x - this.player.x
    const dy = this.ball.y - this.player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > BALL_KICK_RANGE) return // 공에서 너무 멀면 anim 만 재생하고 공은 그대로
    // facing 반대쪽으로는 차지 않음 — 방향 일치 요구
    const sign = this.facing === "east" ? 1 : -1
    if (Math.sign(dx) !== sign && Math.abs(dx) > 5) return
    const angleRad = (KICK_ANGLE_DEG * Math.PI) / 180
    const vx = sign * speed * Math.cos(angleRad)
    const vy = -speed * Math.sin(angleRad)
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body
    ballBody.setVelocity(vx, vy)
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

  private resetBall() {
    const body = this.ball.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0, 0)
    this.ball.setPosition(BALL_RESPAWN_X, BALL_RESPAWN_Y)
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

  private teardown() {
    this.unsubChatSend?.()
    this.unsubChatOpen?.()
    this.unsubChatClose?.()
    this.unsubChatSend = null
    this.unsubChatOpen = null
    this.unsubChatClose = null
    this.chatBubble?.destroy()
    this.chatBubble = null
  }
}
