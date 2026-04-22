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
  preloadProAvatar,
  createProAvatarAnimations,
  textureKeyIdle,
  animKeyWalk,
} from "@/lib/metaverse/avatar/pro-avatar"
import { ChatBubble } from "./chat-bubble"

export const SIDE_SCROLLER_SCENE_KEY = "MetaverseSideScroller"

// 물리 상수 — 메이플/플랫포머 느낌 튜닝용. 숫자 바꾸면 감각 즉시 달라짐.
const GRAVITY_Y = 900
const JUMP_VELOCITY = -440
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

// PixelLab 124×124 프레임 → 0.5 스케일 = 62×62 디스플레이.
// 실제 캐릭터 픽셀은 프레임 중앙에 몰려있어 hitbox 는 좁게 잡아야 벽에
// 꽂히거나 공중에 뜨는 느낌 없음.
const AVATAR_SCALE = 0.5
const AVATAR_BODY_W = 40
const AVATAR_BODY_H = 96
// 124×124 프레임 내 body 좌상단 offset — 캐릭터가 중앙(약 42,12 ~ 82,108)
const AVATAR_BODY_OFFSET_X = 42
const AVATAR_BODY_OFFSET_Y = 12
// 시각 높이 (스케일 적용) — 닉네임/말풍선 오프셋 계산용
const AVATAR_VISUAL_H = AVATAR_BODY_H * AVATAR_SCALE

const BG_TEXTURE = "ss-bg-stadium"
const BG_URL = "/metaverse/bg-stadium.png"

export class SideScrollerScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private player!: Phaser.Physics.Arcade.Sprite
  private nameTag!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private spaceKey!: Phaser.Input.Keyboard.Key
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private facing: "left" | "right" = "right"

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
    preloadProAvatar(this)
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

    // 8방향 walk anim 등록 (east 만 쓰지만 전체 등록해 월드맵과 동일)
    createProAvatarAnimations(this)

    // 플레이어 스프라이트 — 초기 east idle. 좌우 이동은 flipX 로 표현.
    this.player = this.physics.add.sprite(100, FLOOR_TOP_Y - 100, textureKeyIdle("east"))
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setMaxVelocity(WALK_SPEED, MAX_FALL_SPEED)
    // hitbox 는 124×124 프레임 중앙 근처만 — 투명 패딩이 벽에 걸리는 느낌 방지
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setSize(AVATAR_BODY_W, AVATAR_BODY_H)
    playerBody.setOffset(AVATAR_BODY_OFFSET_X, AVATAR_BODY_OFFSET_Y)
    // 드래그는 update()에서 지면/공중 상황에 따라 갱신
    this.physics.add.collider(this.player, this.platforms)

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

    // 카메라 follow + 월드 경계
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)

    // 안내 (UI 오버레이)
    this.add
      .text(16, 16, "← → 이동 · Space 점프 · Enter 채팅", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100)

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
    // 가속/드래그는 지면 vs 공중에 따라 분기 — 공중은 관성 유지
    const accelValue = onGround ? GROUND_ACCEL : AIR_ACCEL
    const dragValue = onGround ? GROUND_DRAG : AIR_DRAG

    if (this.isChatInputOpen) {
      // 입력창 열려있을 땐 가속 0 + 지상 드래그로 부드럽게 정지
      body.setAccelerationX(0)
      body.setDragX(GROUND_DRAG)
    } else {
      const left = this.cursors.left?.isDown || this.wasd.A.isDown
      const right = this.cursors.right?.isDown || this.wasd.D.isDown
      const jump = this.cursors.up?.isDown || this.wasd.W.isDown || this.spaceKey.isDown

      if (left) {
        body.setAccelerationX(-accelValue)
        if (this.facing !== "left") {
          this.facing = "left"
          this.player.setFlipX(true)
        }
      } else if (right) {
        body.setAccelerationX(accelValue)
        if (this.facing !== "right") {
          this.facing = "right"
          this.player.setFlipX(false)
        }
      } else {
        body.setAccelerationX(0)
      }

      body.setDragX(dragValue)

      if (jump && onGround) {
        body.setVelocityY(JUMP_VELOCITY)
      }
    }

    // walk anim — 지상에서 수평 속도 있을 때만. 공중/정지 시엔 idle 텍스처로 리셋.
    const walkingOnGround = onGround && Math.abs(body.velocity.x) > 10
    const walkKey = animKeyWalk("east")
    if (walkingOnGround) {
      if (this.player.anims.currentAnim?.key !== walkKey || !this.player.anims.isPlaying) {
        this.player.play(walkKey, true)
      }
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(textureKeyIdle("east"))
    }

    // 닉네임 태그 + 말풍선 follow
    this.nameTag.setPosition(this.player.x, this.player.y - AVATAR_VISUAL_H / 2 - 6)
    if (this.chatBubble && this.chatBubble.active) {
      this.chatBubble.setPosition(this.player.x, this.player.y - AVATAR_VISUAL_H / 2 - 22)
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
