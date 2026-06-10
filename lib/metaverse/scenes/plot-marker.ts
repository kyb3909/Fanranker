/**
 * PlotMarker — 월드맵의 광장 Plot 영역 시각화.
 * Signboard — 해당 Plot에 방이 세워졌을 때 나타나는 간판.
 */

import * as Phaser from "phaser"
import { METAVERSE } from "@/lib/metaverse/constants"

const PLOT_DEPTH = 2
const SIGN_DEPTH = 8

const EMPTY_FILL = 0xffffff
const EMPTY_FILL_ALPHA = 0.04
const EMPTY_BORDER = 0xffd54f
const OCCUPIED_FILL = 0xffd54f
const OCCUPIED_FILL_ALPHA = 0.08
const OCCUPIED_BORDER = 0xffecb3

interface PlotMarkerOptions {
  id: string
  centerX: number
  centerY: number
  widthUnits: number
  heightUnits: number
}

/**
 * 빈 Plot 영역을 나타내는 바닥 사각형 + 점선 테두리.
 * 유저가 진입하면 내부에서 하이라이트 활성.
 */
export class PlotMarker extends Phaser.GameObjects.Container {
  readonly plotId: string
  private readonly fillRect: Phaser.GameObjects.Rectangle
  private readonly borderGfx: Phaser.GameObjects.Graphics
  readonly widthPx: number
  readonly heightPx: number
  private occupied = false

  constructor(scene: Phaser.Scene, opts: PlotMarkerOptions) {
    super(scene, opts.centerX, opts.centerY)
    this.plotId = opts.id
    this.widthPx = opts.widthUnits * METAVERSE.TILE_SIZE
    this.heightPx = opts.heightUnits * METAVERSE.TILE_SIZE

    this.fillRect = scene.add.rectangle(
      0,
      0,
      this.widthPx,
      this.heightPx,
      EMPTY_FILL,
      EMPTY_FILL_ALPHA
    )
    this.borderGfx = scene.add.graphics()
    this.drawBorder(EMPTY_BORDER)

    this.add([this.fillRect, this.borderGfx])
    this.setDepth(PLOT_DEPTH)
    scene.add.existing(this)
  }

  /** 방 세워진 상태로 전환 — 색감 교체 */
  setOccupied(flag: boolean) {
    if (this.occupied === flag) return
    this.occupied = flag
    this.fillRect.setFillStyle(
      flag ? OCCUPIED_FILL : EMPTY_FILL,
      flag ? OCCUPIED_FILL_ALPHA : EMPTY_FILL_ALPHA
    )
    this.drawBorder(flag ? OCCUPIED_BORDER : EMPTY_BORDER)
  }

  /** 유저가 이 Plot 안에 있는지 체크 (월드 좌표) */
  contains(worldX: number, worldY: number): boolean {
    const halfW = this.widthPx / 2
    const halfH = this.heightPx / 2
    return (
      worldX >= this.x - halfW &&
      worldX <= this.x + halfW &&
      worldY >= this.y - halfH &&
      worldY <= this.y + halfH
    )
  }

  private drawBorder(color: number) {
    this.borderGfx.clear()
    this.borderGfx.lineStyle(1, color, 0.6)

    // 점선 효과 — dash 6px, gap 4px
    const DASH = 6
    const GAP = 4
    const halfW = this.widthPx / 2
    const halfH = this.heightPx / 2
    // 상/하
    for (let x = -halfW; x < halfW; x += DASH + GAP) {
      const end = Math.min(x + DASH, halfW)
      this.borderGfx.lineBetween(x, -halfH, end, -halfH)
      this.borderGfx.lineBetween(x, halfH, end, halfH)
    }
    // 좌/우
    for (let y = -halfH; y < halfH; y += DASH + GAP) {
      const end = Math.min(y + DASH, halfH)
      this.borderGfx.lineBetween(-halfW, y, -halfW, end)
      this.borderGfx.lineBetween(halfW, y, halfW, end)
    }
  }
}

/**
 * Signboard — Plot 중앙에 세워지는 간판. 기둥 + 상단 패널에 방 이름 텍스트.
 */
export class Signboard extends Phaser.GameObjects.Container {
  readonly roomId: string
  readonly ownerUserId: string
  private readonly textObj: Phaser.GameObjects.Text

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    roomId: string,
    ownerUserId: string,
    text: string
  ) {
    super(scene, centerX, centerY)
    this.roomId = roomId
    this.ownerUserId = ownerUserId

    // 기둥 (아바타보다 낮게)
    const post = scene.add.rectangle(0, -8, 3, 26, 0x6d4c41)
    post.setOrigin(0.5, 1)

    // 간판 패널
    const padX = 6
    const padY = 3
    this.textObj = scene.add
      .text(0, -34, text, {
        fontFamily: "sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#3e2723",
        align: "center",
      })
      .setOrigin(0.5, 0.5)

    const panelW = this.textObj.width + padX * 2
    const panelH = this.textObj.height + padY * 2
    const panel = scene.add.rectangle(0, -34, panelW, panelH, 0xffecb3)
    panel.setStrokeStyle(1, 0x3e2723, 1)

    this.add([post, panel, this.textObj])
    this.setDepth(SIGN_DEPTH)
    scene.add.existing(this)
  }

  setText(text: string) {
    this.textObj.setText(text)
  }
}
