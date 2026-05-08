/**
 * TestTilemapScene — Tiled 미니 맵 검증용 씬.
 *
 * 목적: LimeZu 타일셋 + Tiled JSON이 Phaser에서 정상 로드되는지만 확인.
 * 캐릭터·realtime 없음. 추후 정식 world-map-scene.ts 통합의 사전 검증 단계.
 */

import * as Phaser from "phaser"

export const TEST_TILEMAP_SCENE_KEY = "MetaverseTestTilemap"

interface TiledProperty {
  name: string
  type: string
  value: string | number | boolean
}

const CAMERA_PAN_SPEED = 8 // px per frame @60fps ≈ 480 px/s

export class TestTilemapScene extends Phaser.Scene {
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  constructor() {
    super(TEST_TILEMAP_SCENE_KEY)
  }

  preload() {
    this.load.image("modern-exteriors", "/map/tilesets/modern-exteriors.png")
    this.load.tilemapTiledJSON("uk-auto", "/map/uk-auto.json")
  }

  create() {
    const map = this.make.tilemap({ key: "uk-auto" })
    const tileset = map.addTilesetImage("Modern_Exteriors_Complete_Tileset", "modern-exteriors")

    if (!tileset) {
      this.add.text(16, 16, "타일셋 로드 실패 — Tiled 'Name' 칸이 다를 수 있음", {
        color: "#ff5555",
        fontSize: "14px",
      })
      return
    }

    map.createLayer("background", tileset, 0, 0)
    map.createLayer("decoration", tileset, 0, 0)
    map.createLayer("collision", tileset, 0, 0)?.setVisible(false)

    const objectsLayer = map.getObjectLayer("objects")
    objectsLayer?.objects.forEach((obj) => {
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
    })

    const mapPxW = map.widthInPixels
    const mapPxH = map.heightInPixels
    this.cameras.main.setZoom(1)
    this.cameras.main.setBounds(0, 0, mapPxW, mapPxH)
    this.cameras.main.centerOn(mapPxW / 2, mapPxH / 2)
    this.cameras.main.setBackgroundColor("#0b1320")

    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >
    this.cursors = this.input.keyboard!.createCursorKeys()
  }

  update() {
    if (!this.wasd) return
    const cam = this.cameras.main
    const left = this.wasd.A.isDown || this.cursors.left?.isDown
    const right = this.wasd.D.isDown || this.cursors.right?.isDown
    const up = this.wasd.W.isDown || this.cursors.up?.isDown
    const down = this.wasd.S.isDown || this.cursors.down?.isDown
    if (left) cam.scrollX -= CAMERA_PAN_SPEED
    if (right) cam.scrollX += CAMERA_PAN_SPEED
    if (up) cam.scrollY -= CAMERA_PAN_SPEED
    if (down) cam.scrollY += CAMERA_PAN_SPEED
  }
}
