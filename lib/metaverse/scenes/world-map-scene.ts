/**
 * WorldMapScene — 메타버스 Phase 1 월드맵 씬.
 *
 * 현재 범위 (Phase 1a — 단일 플레이어):
 *  - 플레이스홀더 배경 (단색 + 간단 지형 rect)
 *  - 플레이어 아바타 (플레이스홀더 rect)
 *  - WASD / 화살표 이동 + 카메라 follow
 *  - 닉네임 태그
 *
 * Phase 1b 계획 (다음 커밋):
 *  - Supabase Realtime Presence (원격 유저 표시)
 *  - Broadcast 채팅 + proximity 말풍선
 *
 * 향후 에셋 교체 지점:
 *  - this.add.rectangle(..., COLOR_LAND) → tilemap 로드
 *  - COLOR_PLAYER_SELF rect → sprite atlas
 */

import * as Phaser from "phaser"
import { METAVERSE, pinToWorldX, pinToWorldY } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export const WORLD_MAP_SCENE_KEY = "MetaverseWorldMap"

export class WorldMapScene extends Phaser.Scene {
  private identity!: MetaversePlayerIdentity
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private nameTag!: Phaser.GameObjects.Text

  constructor() {
    super(WORLD_MAP_SCENE_KEY)
  }

  init(data: { identity: MetaversePlayerIdentity }) {
    this.identity = data.identity
  }

  create() {
    const { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SIZE, COLOR_BG, COLOR_LAND, COLOR_WATER } = METAVERSE

    // 카메라 + 월드 경계
    this.cameras.main.setBackgroundColor(COLOR_BG)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // 플레이스홀더 지형 — UK 지도 실루엣을 단순한 rect로 대체 (에셋 나오면 tilemap으로 교체)
    // 배경 전체: 바다
    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, COLOR_WATER).setOrigin(0, 0)

    // 내륙 덩어리 (대략 UK 모양의 rect 3~4개로 실루엣)
    this.drawLandPlaceholder(COLOR_LAND)

    // 광장 영역 placeholder (런던, 맨체스터, 리버풀, 뉴캐슬)
    // DB seed와 좌표 일치 (constants.ts의 pinToWorldX/Y로 변환)
    this.drawPlazaMarker("런던 광장", 51, 70)
    this.drawPlazaMarker("맨체스터 광장", 41, 42)
    this.drawPlazaMarker("리버풀 광장", 38, 46)
    this.drawPlazaMarker("뉴캐슬 광장", 52, 30)

    // 플레이어 아바타 (placeholder)
    const textureKey = "metaverse-player-placeholder"
    if (!this.textures.exists(textureKey)) {
      const g = this.add.graphics()
      g.fillStyle(METAVERSE.COLOR_PLAYER_SELF, 1)
      g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
      g.lineStyle(2, 0xffffff, 1)
      g.strokeRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
      g.generateTexture(textureKey, PLAYER_SIZE, PLAYER_SIZE)
      g.destroy()
    }

    // 스폰: 런던 중앙 광장 (Wembley 앞)
    const spawnX = pinToWorldX(51)
    const spawnY = pinToWorldY(70)
    this.player = this.physics.add.sprite(spawnX, spawnY, textureKey)
    this.player.setCollideWorldBounds(true)

    // 닉네임 태그
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
      .setDepth(10)

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >

    // 카메라 follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.setZoom(1)
  }

  update() {
    if (!this.player) return

    const { PLAYER_SPEED } = METAVERSE
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    const left = this.cursors.left?.isDown || this.wasd.A.isDown
    const right = this.cursors.right?.isDown || this.wasd.D.isDown
    const up = this.cursors.up?.isDown || this.wasd.W.isDown
    const down = this.cursors.down?.isDown || this.wasd.S.isDown

    if (left) body.setVelocityX(-PLAYER_SPEED)
    else if (right) body.setVelocityX(PLAYER_SPEED)
    if (up) body.setVelocityY(-PLAYER_SPEED)
    else if (down) body.setVelocityY(PLAYER_SPEED)

    // 대각선 속도 정규화
    body.velocity.normalize().scale(PLAYER_SPEED)

    // 닉네임 태그 따라다니기
    this.nameTag.setPosition(this.player.x, this.player.y + METAVERSE.PLAYER_NAMETAG_OFFSET_Y)
  }

  // ============================================================
  // Placeholder 지형/광장 그리기 — 실제 에셋 나오면 제거/대체
  // ============================================================

  private drawLandPlaceholder(color: number) {
    // UK 대략 실루엣: 본섬 (남동~북서) + 스코틀랜드 + 웨일스 돌출
    // pin 좌표계 (0~100) 기준, 실제 UK 지리와 대강 일치
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

    // 광장 영역 표시 (반투명 원)
    this.add.circle(x, y, 80, 0xffd54f, 0.15).setStrokeStyle(2, 0xffd54f, 0.5)

    // 라벨
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
