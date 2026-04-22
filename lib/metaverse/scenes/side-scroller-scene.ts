/**
 * SideScrollerScene — 메이플스토리 스타일 실내 프로토타입 (Phase 4 선행).
 *
 * 검증 목표:
 *  - 중력 + 플랫폼 콜리전
 *  - 좌/우 이동 + 점프 (방향 flip)
 *  - 카메라 좌우 스크롤
 *  - 닉네임 태그 follow
 *
 * 현재는 단독 scene. world-map-scene 과 별개 게임 인스턴스로 부트.
 * Phase 4 에서 월드맵 ↔ 실내 씬 전환 추가 예정.
 *
 * 에셋 교체 지점:
 *  - 바닥/플랫폼 단색 rect → 실제 타일맵(Tiled) 또는 배경 PNG
 *  - 플레이어 rect → 사이드뷰 스프라이트시트 (PixelLab view: "side")
 *  - NPC rect → 같은 스프라이트 + 애니메이션
 */

import * as Phaser from "phaser"
import { METAVERSE } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export const SIDE_SCROLLER_SCENE_KEY = "MetaverseSideScroller"

// 물리 상수 — 메이플 느낌 튜닝용. 필요시 조정.
const GRAVITY_Y = 900
const JUMP_VELOCITY = -420
const WALK_SPEED = 200

// 씬 크기 — 가로로 긴 실내. 카메라가 좌우 팬.
const SCENE_WIDTH = 1920
const SCENE_HEIGHT = 720
const FLOOR_TOP_Y = 620
const FLOOR_HEIGHT = SCENE_HEIGHT - FLOOR_TOP_Y

const PLAYER_W = 24
const PLAYER_H = 40

const SELF_TEXTURE = "ss-player-self"

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

  create() {
    // 월드 경계 + 중력 (이 씬 로컬 중력 — 월드맵 씬에 영향 없음)
    this.physics.world.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    this.physics.world.gravity.y = GRAVITY_Y

    // 배경 — 그라데이션 느낌 2단 단색 (placeholder)
    this.cameras.main.setBackgroundColor("#1a1f2e")
    this.add.rectangle(0, 0, SCENE_WIDTH, FLOOR_TOP_Y, 0x2a3144).setOrigin(0, 0)

    // 원근감 (먼 배경) — 차후 병렬 스크롤 레이어로 교체 가능
    this.drawBackdropDecor()

    // 플랫폼 그룹 — 바닥 + 중간 플랫폼 3개
    this.platforms = this.physics.add.staticGroup()
    this.addPlatformRect(0, FLOOR_TOP_Y, SCENE_WIDTH, FLOOR_HEIGHT, 0x5d4e37) // 바닥
    this.addPlatformRect(400, 480, 200, 20, 0x8b7355) // 중간 1
    this.addPlatformRect(800, 380, 200, 20, 0x8b7355) // 중간 2 (더 높음)
    this.addPlatformRect(1200, 480, 200, 20, 0x8b7355) // 중간 3

    // NPC placeholder — 바닥에 서있는 색깔 사각형
    this.drawNpcPlaceholder(200, 0xff6b6b, "NPC A")
    this.drawNpcPlaceholder(700, 0x4dabf7, "NPC B")
    this.drawNpcPlaceholder(1500, 0x51cf66, "NPC C")

    // 플레이어 텍스처 & 스프라이트
    this.createPlayerTexture()
    this.player = this.physics.add.sprite(100, FLOOR_TOP_Y - PLAYER_H - 20, SELF_TEXTURE)
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
    g.fillStyle(METAVERSE.COLOR_PLAYER_SELF, 1)
    g.fillRect(0, 0, PLAYER_W, PLAYER_H)
    g.lineStyle(2, 0xffffff, 1)
    g.strokeRect(0, 0, PLAYER_W, PLAYER_H)
    // 머리 표시 (상단 1/3)
    g.fillStyle(0xffffff, 0.3)
    g.fillRect(2, 2, PLAYER_W - 4, PLAYER_H / 3)
    // 방향 시각 표시용 눈
    g.fillStyle(0xffffff, 0.9)
    g.fillRect(PLAYER_W - 8, 8, 3, 3)
    g.generateTexture(SELF_TEXTURE, PLAYER_W, PLAYER_H)
    g.destroy()
  }

  private addPlatformRect(x: number, y: number, w: number, h: number, color: number) {
    const rect = this.add.rectangle(x, y, w, h, color).setOrigin(0, 0)
    this.platforms.add(rect)
  }

  private drawNpcPlaceholder(x: number, color: number, label: string) {
    this.add.rectangle(x, FLOOR_TOP_Y, 24, 40, color).setOrigin(0.5, 1)
    this.add
      .text(x, FLOOR_TOP_Y - 44, label, {
        fontFamily: "sans-serif",
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10)
  }

  private drawBackdropDecor() {
    // 원경 산맥/건물 실루엣 — 스크롤 속도 느리게 해서 원근감
    const bg = this.add.graphics()
    bg.fillStyle(0x1f2938, 1)
    // 삼각형 시리즈 (산맥 느낌)
    for (let x = 0; x < SCENE_WIDTH; x += 220) {
      bg.fillTriangle(x, FLOOR_TOP_Y, x + 140, FLOOR_TOP_Y - 160, x + 280, FLOOR_TOP_Y)
    }
    bg.setScrollFactor(0.4) // 병렬 스크롤
  }
}
