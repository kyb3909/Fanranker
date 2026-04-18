/**
 * StadiumChatScene — Phase 2a 오프라인 MVP
 *
 * 현재 범위: 단색 풀밭 배경 + 단일 아바타(사각형 플레이스홀더) + 화살표/WASD 이동 + 카메라 follow.
 * Phase 2b에서 추가: Craftpix 타일맵 렌더, 아바타 스프라이트시트, 채팅 말풍선,
 * Supabase Realtime 동기화.
 */

import Phaser from "phaser"

export const STADIUM_CHAT_SCENE_KEY = "StadiumChat"

const WORLD_WIDTH = 2400
const WORLD_HEIGHT = 600
const PLAYER_SPEED = 160
const PLAYER_SIZE = 24
const FIELD_COLOR = 0x558b2f

export class StadiumChatScene extends Phaser.Scene {
  private stadiumId = ""
  private stadiumName = ""
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private nameTag!: Phaser.GameObjects.Text

  constructor() {
    super(STADIUM_CHAT_SCENE_KEY)
  }

  init(data: { stadiumId?: string; stadiumName?: string; myNickname?: string }) {
    this.stadiumId = data.stadiumId ?? "preview"
    this.stadiumName = data.stadiumName ?? "경기장 미리보기"
    this.data.set("myNickname", data.myNickname ?? "나")
  }

  create() {
    this.cameras.main.setBackgroundColor("#87CEEB")
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // 하늘/잔디 2단 배경 (Phase 2b에서 타일맵으로 대체)
    const skyHeight = WORLD_HEIGHT * 0.55
    this.add.rectangle(0, 0, WORLD_WIDTH, skyHeight, 0x87ceeb).setOrigin(0, 0).setScrollFactor(1, 0)
    this.add
      .rectangle(0, skyHeight, WORLD_WIDTH, WORLD_HEIGHT - skyHeight, FIELD_COLOR)
      .setOrigin(0, 0)

    // 경기장 이름 라벨 (월드 좌표)
    this.add
      .text(WORLD_WIDTH / 2, 40, this.stadiumName, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0.5, 0)

    // 아바타 (Phaser.Physics.Arcade.Sprite 대신 Graphics 텍스처 생성)
    const textureKey = "player-placeholder"
    if (!this.textures.exists(textureKey)) {
      const g = this.add.graphics()
      g.fillStyle(0x2962ff, 1)
      g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
      g.lineStyle(2, 0xffffff, 1)
      g.strokeRect(0, 0, PLAYER_SIZE, PLAYER_SIZE)
      g.generateTexture(textureKey, PLAYER_SIZE, PLAYER_SIZE)
      g.destroy()
    }

    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, skyHeight + 100, textureKey)
    this.player.setCollideWorldBounds(true)

    // 닉네임 태그
    const myNickname = (this.data.get("myNickname") as string) || "나"
    this.nameTag = this.add
      .text(this.player.x, this.player.y - PLAYER_SIZE / 2 - 8, myNickname, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)

    // 카메라
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15)

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd

    // 디버그: 조작 안내
    this.add
      .text(16, 16, `stadium: ${this.stadiumId}\n화살표/WASD로 이동`, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ffffff",
        backgroundColor: "#00000066",
        padding: { x: 4, y: 2 },
      })
      .setScrollFactor(0)
  }

  update() {
    if (!this.player) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    const left = this.cursors.left?.isDown || this.wasd.A?.isDown
    const right = this.cursors.right?.isDown || this.wasd.D?.isDown
    const up = this.cursors.up?.isDown || this.wasd.W?.isDown
    const down = this.cursors.down?.isDown || this.wasd.S?.isDown

    if (left) body.setVelocityX(-PLAYER_SPEED)
    else if (right) body.setVelocityX(PLAYER_SPEED)
    if (up) body.setVelocityY(-PLAYER_SPEED)
    else if (down) body.setVelocityY(PLAYER_SPEED)

    // 대각선 이동 속도 정규화
    body.velocity.normalize().scale(PLAYER_SPEED)

    // 닉네임 태그 따라감
    this.nameTag.setPosition(this.player.x, this.player.y - PLAYER_SIZE / 2 - 8)
  }
}
