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
import { MAPS, type MapConfig, type MapId, type DoorConfig } from "@/lib/metaverse/maps/map-config"
import {
  preloadAllAvatarPresets,
  createAllAvatarAnimations,
  texKeyIdle,
  texKeyRotation,
  animKey,
  type Facing,
  type RotationDir,
} from "@/lib/metaverse/avatar/pro-avatar-xl"
import { DEFAULT_AVATAR_KEY, getAvatarPreset } from "@/lib/metaverse/avatar/presets"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export const INDOOR_MAP_SCENE_KEY = "MetaverseIndoorMap"

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

export interface IndoorMapInit {
  identity: MetaversePlayerIdentity
  mapId: MapId
  spawnX?: number
}

interface DoorHandle {
  rect: Phaser.Geom.Rectangle
  door: DoorConfig
  prompt: Phaser.GameObjects.Text
}

type PlayerState = "idle" | "walking" | "jumping" | "kicking"

export class IndoorMapScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private mapConfig!: MapConfig
  private spawnX!: number
  private presetKey: string = DEFAULT_AVATAR_KEY
  private avatarVisualH: number = 98
  /** 킥 시 사이즈 일치용 보정 스케일 (Arsenal kick 프레임이 idle 보다 큰 케이스에 0.65 등) */
  private presetKickScale: number = 1

  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private rKey!: Phaser.Input.Keyboard.Key
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
  private orientation: RotationDir = "east"
  private state: PlayerState = "idle"
  /** 페이드 전환 중에는 입력·도어 트리거 무시 — 중복 트리거 방지 */
  private isTransitioning = false

  constructor() {
    super(INDOOR_MAP_SCENE_KEY)
  }

  init(data: IndoorMapInit) {
    this.identity = data.identity
    this.presetKey = data.identity.avatarKey ?? DEFAULT_AVATAR_KEY
    this.mapConfig = MAPS[data.mapId]
    this.spawnX = data.spawnX ?? this.mapConfig.defaultSpawnX
    // restart() 후 상태 초기화
    this.isTransitioning = false
    this.facing = "east"
    this.orientation = "east"
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
  }

  preload() {
    const bgKey = `bg-${this.mapConfig.id}`
    if (!this.textures.exists(bgKey)) {
      this.load.image(bgKey, this.mapConfig.bgUrl)
    }
    if (this.mapConfig.hasBall && !this.textures.exists(BALL_TEXTURE)) {
      this.load.image(BALL_TEXTURE, BALL_URL)
    }
    preloadAllAvatarPresets(this)
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

    createAllAvatarAnimations(this)

    const preset = getAvatarPreset(this.presetKey)
    this.player = this.physics.add.sprite(
      this.spawnX,
      floorTopY - 100,
      texKeyIdle("east", this.presetKey)
    )
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setMaxVelocity(WALK_SPEED, MAX_FALL_SPEED)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setSize(preset.bodyWidth, preset.bodyHeight)
    playerBody.setOffset(preset.bodyOffsetX, preset.bodyOffsetY)
    this.physics.add.collider(this.player, this.platforms)
    this.avatarVisualH = preset.bodyHeight * AVATAR_SCALE
    this.presetKickScale = preset.kickScale ?? 1

    // 킥 anim 완료 → 공 발사 + scale 복원 + Y 락 한 번 더 강제 후 해제 + 중력 복원
    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        const key = anim.key
        if (
          key === animKey("kick", "east", this.presetKey) ||
          key === animKey("kick", "west", this.presetKey)
        ) {
          this.applyPendingKickToBall()
          const body = this.player.body as Phaser.Physics.Arcade.Body
          // 1. 스케일 idle 로 복원
          this.player.setScale(AVATAR_SCALE)
          // 2. 락 Y 로 한 번 더 강제 — scale 변화로 sprite.y 가 흔들렸을 가능성 차단
          if (this.kickLockY !== null) {
            this.player.y = this.kickLockY
          }
          body.setVelocity(0, 0)
          body.updateFromGameObject()
          // 3. 잠금 해제 + 중력 복원
          this.kickLockY = null
          body.allowGravity = true
          this.state = "idle"
          this.orientation = this.facing
          this.player.setTexture(texKeyRotation(this.facing, this.presetKey))
          this.player.setFlipX(false)
        }
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

    // 닉네임 태그
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

    // 카메라
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, bgWidth, bgHeight)

    // 진입 페이드인
    this.cameras.main.fadeIn(FADE_DURATION_MS, 0, 0, 0)
  }

  update(_time: number, deltaMs: number) {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const onGround = body.blocked.down

    // 공 회전 + 바닥 안전 클램프 — 매 프레임
    this.updateBallTick(deltaMs)

    // 페이드 중엔 입력 무시. 단 charge bar 는 비활성화 emit 해서 HUD 동기화
    if (this.isTransitioning) {
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

    const left = this.cursors.left?.isDown || this.wasd.A.isDown
    const right = this.cursors.right?.isDown || this.wasd.D.isDown
    const upPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W)
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey)
    const kickJustDown = this.mapConfig.hasBall && Phaser.Input.Keyboard.JustDown(this.rKey)
    const kickJustUp = this.mapConfig.hasBall && Phaser.Input.Keyboard.JustUp(this.rKey)

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
        // 1. Y 잠금 (sprite.y 고정값 저장)
        this.kickLockY = this.player.y
        // 2. 중력 차단
        body.allowGravity = false
        // 3. 킥 anim 재생
        this.player.play(animKey("kick", "east", this.presetKey), true)
        this.player.setFlipX(this.facing === "west")
        // 4. 사이즈 일치용 스케일 보정 (Arsenal 처럼 kickScale<1 인 프리셋만 변화)
        this.player.setScale(AVATAR_SCALE * this.presetKickScale)
        // 5. 스케일 변경으로 sprite.y 가 바뀌었을 가능성 → 즉시 락 Y 로 강제
        this.player.y = this.kickLockY
        body.updateFromGameObject()
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
      this.orientation = "west"
    } else if (right) {
      body.setAccelerationX(accelValue)
      this.facing = "east"
      this.orientation = "east"
    } else {
      body.setAccelerationX(0)
    }
    body.setDragX(dragValue)

    // 점프
    if (jumpPressed && onGround) {
      body.setVelocityY(JUMP_VELOCITY)
      this.state = "jumping"
      this.player.play(animKey("jump", this.facing, this.presetKey), true)
    } else if (this.state === "jumping" && onGround && body.velocity.y >= 0) {
      this.state = "idle"
    }

    // walk / idle anim 동기화
    if (this.state !== "jumping") {
      const moving = onGround && Math.abs(body.velocity.x) > 10
      this.state = moving ? "walking" : "idle"
      if (moving) {
        const walkKey = animKey("walk", this.facing, this.presetKey)
        if (this.player.anims.currentAnim?.key !== walkKey || !this.player.anims.isPlaying) {
          this.player.play(walkKey, true)
        }
      } else {
        if (this.player.anims.isPlaying) this.player.anims.stop()
        this.player.setTexture(texKeyRotation(this.orientation, this.presetKey))
      }
    }
    this.player.setFlipX(false)

    this.updateNameTag()
    this.updateChargeBar()

    // 도어 검사 — 위 입력 시 페이드 전환
    for (const handle of this.doorHandles) {
      const inside = handle.rect.contains(this.player.x, this.player.y)
      handle.prompt.setVisible(inside)
      if (inside && upPressed) {
        this.transitionToMap(handle.door.targetMapId, handle.door.targetSpawnX)
        return
      }
    }
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
    this.player.setFlipX(false)
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
    this.nameTag.setPosition(this.player.x, this.player.y - this.avatarVisualH / 2 - 6)
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
