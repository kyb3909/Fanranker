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

export const SIDE_SCROLLER_SCENE_KEY = "MetaverseSideScroller"

// 물리 상수 — 메이플 느낌 튜닝용. 필요시 조정.
const GRAVITY_Y = 900
const JUMP_VELOCITY = -420
const WALK_SPEED = 200

// 씬 크기 — 배경 이미지(bg-stadium.png 1916×821)와 정확히 일치.
const SCENE_WIDTH = 1916
const SCENE_HEIGHT = 821
// 바닥선 — 배경 이미지의 전면 잔디/돌벽 foreground 가 시작되는 y.
// 이미지 보면서 대략 잡은 값 — PixelLab 지형 나오면 다시 튜닝.
const FLOOR_TOP_Y = 740
const FLOOR_HEIGHT = SCENE_HEIGHT - FLOOR_TOP_Y

const PLAYER_W = 28
const PLAYER_H = 52

const SELF_TEXTURE = "ss-player-self"
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

    // 플레이어 텍스처 & 스프라이트 — 배경보다 위 (depth 10)
    this.createPlayerTexture()
    this.player = this.physics.add.sprite(100, FLOOR_TOP_Y - PLAYER_H - 20, SELF_TEXTURE)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0) // 바닥에 떨어졌을 때 튕기지 않음
    this.physics.add.collider(this.player, this.platforms)

    // 닉네임 태그
    this.nameTag = this.add
      .text(this.player.x, this.player.y - PLAYER_H, this.identity.nickname, {
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
      .text(16, 16, "← → 이동 · Space 점프", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100)
  }

  update() {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const left = this.cursors.left?.isDown || this.wasd.A.isDown
    const right = this.cursors.right?.isDown || this.wasd.D.isDown
    const jump = this.cursors.up?.isDown || this.wasd.W.isDown || this.spaceKey.isDown

    // 수평 이동 + 방향
    if (left) {
      body.setVelocityX(-WALK_SPEED)
      if (this.facing !== "left") {
        this.facing = "left"
        this.player.setFlipX(true)
      }
    } else if (right) {
      body.setVelocityX(WALK_SPEED)
      if (this.facing !== "right") {
        this.facing = "right"
        this.player.setFlipX(false)
      }
    } else {
      body.setVelocityX(0)
    }

    // 점프 — 바닥/플랫폼 위에 있을 때만 (이중 점프 없음)
    if (jump && body.blocked.down) {
      body.setVelocityY(JUMP_VELOCITY)
    }

    // 닉네임 태그 follow
    this.nameTag.setPosition(this.player.x, this.player.y - PLAYER_H / 2 - 6)
  }

  // ============================================================
  // Placeholder 그래픽 — 실제 에셋 들어오면 전부 교체
  // ============================================================

  private createPlayerTexture() {
    if (this.textures.exists(SELF_TEXTURE)) return
    const g = this.add.graphics()
    // 몸통 (하단 2/3)
    g.fillStyle(METAVERSE.COLOR_PLAYER_SELF, 1)
    g.fillRect(0, PLAYER_H / 3, PLAYER_W, (PLAYER_H * 2) / 3)
    // 머리 (상단 1/3, 살구색)
    g.fillStyle(0xffd8a8, 1)
    g.fillRect(4, 0, PLAYER_W - 8, PLAYER_H / 3)
    // 외곽선
    g.lineStyle(2, 0x000000, 0.7)
    g.strokeRect(0, PLAYER_H / 3, PLAYER_W, (PLAYER_H * 2) / 3)
    g.strokeRect(4, 0, PLAYER_W - 8, PLAYER_H / 3)
    // 방향 눈 (오른쪽 바라봄)
    g.fillStyle(0x111111, 1)
    g.fillRect(PLAYER_W - 10, 6, 3, 3)
    g.generateTexture(SELF_TEXTURE, PLAYER_W, PLAYER_H)
    g.destroy()
  }
}
