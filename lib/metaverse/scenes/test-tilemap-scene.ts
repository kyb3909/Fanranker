/**
 * TestTilemapScene — Tiled 미니 맵 검증용 씬.
 *
 * 목적: LimeZu 타일셋 + Tiled JSON 로드 + 캐릭터 이동 + 카메라 follow + 바다 충돌 + 경기장
 * entrance 클릭. 추후 정식 world-map-scene.ts 통합의 사전 검증 단계.
 */

import * as Phaser from "phaser"
import {
  preloadProAvatar,
  createProAvatarAnimations,
  textureKeyIdle,
  animKeyWalk,
  direction8FromVelocity,
  type Direction8,
} from "@/lib/metaverse/avatar/pro-avatar"

export const TEST_TILEMAP_SCENE_KEY = "MetaverseTestTilemap"

interface TiledProperty {
  name: string
  type: string
  value: string | number | boolean
}

const PLAYER_SPEED = 200
const AVATAR_SCALE = 0.4
const MINIMAP_W = 120
const MINIMAP_H = 180
const MINIMAP_PAD = 12

export class TestTilemapScene extends Phaser.Scene {
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private player!: Phaser.Physics.Arcade.Sprite
  private lastDir8: Direction8 = "south"

  constructor() {
    super(TEST_TILEMAP_SCENE_KEY)
  }

  preload() {
    this.load.image("modern-exteriors", "/map/tilesets/modern-exteriors.png")
    this.load.tilemapTiledJSON("uk-auto", "/map/uk-auto.json")
    for (let i = 1; i <= 5; i++) {
      this.load.image(`tree-${i}`, `/map/decoration/tree-${i}.png`)
      this.load.image(`tree-s-${i}`, `/map/decoration/tree-s-${i}.png`)
    }
    for (let i = 1; i <= 4; i++) {
      this.load.image(`sprout-${i}`, `/map/decoration/sprout-${i}.png`)
    }
    for (let i = 1; i <= 9; i++) {
      this.load.image(`water-edge-${i}`, `/map/decoration/water-edge-${i}.png`)
    }
    // Wang ocean-grass tiles (9 unique masks)
    const wangMasks = ["0000", "0001", "0010", "0011", "0110", "0111", "1001", "1011", "1111"]
    for (const m of wangMasks) {
      this.load.image(`og-${m}`, `/map/decoration/wang/og-${m}.png`)
    }
    // Wang grass-river tiles (16 unique masks)
    for (let i = 0; i < 16; i++) {
      const m = i.toString(2).padStart(4, "0")
      this.load.image(`r-${m}`, `/map/decoration/wang-river/r-${m}.png`)
    }
    preloadProAvatar(this)
  }

  create() {
    const map = this.make.tilemap({ key: "uk-auto" })
    const tileset = map.addTilesetImage("Modern_Exteriors_Complete_Tileset", "modern-exteriors")

    if (!tileset) {
      this.add.text(16, 16, "타일셋 로드 실패", { color: "#ff5555", fontSize: "14px" })
      return
    }

    const bgLayer = map.createLayer("background", tileset, 0, 0)
    map.createLayer("decoration", tileset, 0, 0)
    map.createLayer("collision", tileset, 0, 0)?.setVisible(false)
    void bgLayer
    // 충돌은 정식 통합에서 hitbox 정밀 튜닝 후 활성화 — 검증 단계는 끔

    // 경기장 entrance — 사각형 + 라벨 + 클릭
    let spawnX = map.widthInPixels / 2
    let spawnY = map.heightInPixels / 2
    const objectsLayer = map.getObjectLayer("objects")
    objectsLayer?.objects.forEach((obj) => {
      // Tree / Sprout / water-edge / wang(coastline) / wang-river decoration
      if (
        obj.type === "tree" ||
        obj.type === "sprout" ||
        obj.type === "water-edge" ||
        obj.type === "wang" ||
        obj.type === "wang-river"
      ) {
        const props = (obj.properties ?? []) as TiledProperty[]
        const asset = (props.find((p) => p.name === "asset")?.value as string) ?? "tree-1"
        const w = obj.width ?? 16
        const h = obj.height ?? 16
        const depth =
          obj.type === "tree"
            ? 5
            : obj.type === "sprout"
              ? 4
              : obj.type === "water-edge"
                ? 3
                : obj.type === "wang-river"
                  ? 2
                  : 1
        this.add.image((obj.x ?? 0) + w / 2, (obj.y ?? 0) + h / 2, asset).setDepth(depth)
        return
      }
      if (obj.type !== "stadium_entrance" && obj.type !== "entrance") return
      const w = obj.width ?? 32
      const h = obj.height ?? 32
      const cx = (obj.x ?? 0) + w / 2
      const cy = (obj.y ?? 0) + h / 2

      const props = (obj.properties ?? []) as TiledProperty[]
      const label = (props.find((p) => p.name === "label")?.value as string) ?? obj.name ?? "?"

      const rect = this.add.rectangle(cx, cy, w, h, 0xff5555, 0.4)
      rect.setStrokeStyle(2, 0xffffff)
      rect.setInteractive({ useHandCursor: true })

      this.add
        .text(cx, cy - h / 2 - 4, label, {
          color: "#ffffff",
          fontSize: "10px",
          backgroundColor: "#000000cc",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 1)

      rect.on("pointerdown", () => {
        const target = props.find((p) => p.name === "target_scene")?.value
        const stadiumName = props.find((p) => p.name === "stadium_name")?.value
        // eslint-disable-next-line no-alert
        window.alert(`${label}\n${stadiumName ?? ""}\ntarget_scene: ${target}`)
      })

      // Wembley 위치를 spawn 으로 — 사용자가 처음 보면 런던 + Big6 가까움
      if (obj.name === "epl_wembley") {
        spawnX = cx
        spawnY = cy + h * 1.5 // entrance 살짝 아래
      }
    })

    // 캐릭터
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.player = this.physics.add.sprite(spawnX, spawnY, textureKeyIdle("south"))
    this.player.setScale(AVATAR_SCALE)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)

    createProAvatarAnimations(this)

    // 카메라
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setZoom(1)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBackgroundColor("#0b1320")

    // 미니맵 (우상단) — 영국 비율 (2:3) 에 맞춰 세로 길게
    const viewW = this.scale.width
    const minimapX = viewW - MINIMAP_W - MINIMAP_PAD
    const minimapY = MINIMAP_PAD
    const minimapZoom = Math.min(MINIMAP_W / map.widthInPixels, MINIMAP_H / map.heightInPixels)
    const minimap = this.cameras.add(minimapX, minimapY, MINIMAP_W, MINIMAP_H)
    minimap.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    minimap.setZoom(minimapZoom)
    minimap.centerOn(map.widthInPixels / 2, map.heightInPixels / 2)
    minimap.setBackgroundColor("#0b1320")

    // 미니맵 border (HUD)
    const border = this.add
      .rectangle(minimapX, minimapY, MINIMAP_W, MINIMAP_H)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setFillStyle(0, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
    minimap.ignore(border)

    // 입력
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >
    this.cursors = this.input.keyboard!.createCursorKeys()
  }

  update() {
    if (!this.player) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0)

    const left = this.wasd.A.isDown || this.cursors.left?.isDown
    const right = this.wasd.D.isDown || this.cursors.right?.isDown
    const up = this.wasd.W.isDown || this.cursors.up?.isDown
    const down = this.wasd.S.isDown || this.cursors.down?.isDown

    if (left) body.setVelocityX(-PLAYER_SPEED)
    else if (right) body.setVelocityX(PLAYER_SPEED)
    if (up) body.setVelocityY(-PLAYER_SPEED)
    else if (down) body.setVelocityY(PLAYER_SPEED)

    body.velocity.normalize().scale(PLAYER_SPEED)

    const dir8 = direction8FromVelocity(body.velocity.x, body.velocity.y)
    if (dir8) {
      if (this.lastDir8 !== dir8 || this.player.anims.currentAnim?.key !== animKeyWalk(dir8)) {
        this.lastDir8 = dir8
        this.player.play(animKeyWalk(dir8), true)
      }
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(textureKeyIdle(this.lastDir8))
    }
  }
}
