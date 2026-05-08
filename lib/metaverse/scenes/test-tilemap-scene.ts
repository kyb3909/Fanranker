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

export class TestTilemapScene extends Phaser.Scene {
  constructor() {
    super(TEST_TILEMAP_SCENE_KEY)
  }

  preload() {
    this.load.image("modern-exteriors", "/map/tilesets/modern-exteriors.png")
    this.load.tilemapTiledJSON("uk-test", "/map/uk-test.json")
  }

  create() {
    const map = this.make.tilemap({ key: "uk-test" })
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
      if (obj.type !== "entrance") return
      const w = obj.width ?? 32
      const h = obj.height ?? 32
      const cx = (obj.x ?? 0) + w / 2
      const cy = (obj.y ?? 0) + h / 2

      const rect = this.add.rectangle(cx, cy, w, h, 0xff5555, 0.25)
      rect.setStrokeStyle(2, 0xff5555)
      rect.setInteractive({ useHandCursor: true })

      this.add
        .text(cx, cy - h / 2 - 6, obj.name ?? "?", {
          color: "#ffffff",
          fontSize: "12px",
          backgroundColor: "#000000aa",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1)

      rect.on("pointerdown", () => {
        const props = (obj.properties ?? []) as TiledProperty[]
        const target = props.find((p) => p.name === "target_scene")?.value
        // eslint-disable-next-line no-alert
        window.alert(`Entrance: ${obj.name}\ntarget_scene: ${target}`)
      })
    })

    this.cameras.main.setBackgroundColor("#000000")
  }
}
