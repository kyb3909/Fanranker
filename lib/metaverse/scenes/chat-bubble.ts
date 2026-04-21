/**
 * ChatBubble — 아바타 위에 떠오르는 말풍선.
 * 일정 시간 후 자동 제거. 위치는 scene update()에서 부모 아바타 따라가게 갱신.
 */

import * as Phaser from "phaser"

const PADDING_X = 6
const PADDING_Y = 3
const CORNER_RADIUS = 4
const BUBBLE_DEPTH = 50

export class ChatBubble extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly textObj: Phaser.GameObjects.Text
  private expireTimer: Phaser.Time.TimerEvent | null = null

  constructor(scene: Phaser.Scene, text: string) {
    super(scene, 0, 0)

    this.textObj = scene.add.text(0, 0, text, {
      fontFamily: "sans-serif",
      fontSize: "12px",
      color: "#111111",
      wordWrap: { width: 180 },
      align: "center",
    })
    this.textObj.setOrigin(0.5, 1)

    this.bg = scene.add.graphics()
    this.drawBackground()

    this.add([this.bg, this.textObj])
    this.setDepth(BUBBLE_DEPTH)
    scene.add.existing(this)
  }

  private drawBackground() {
    const w = this.textObj.width + PADDING_X * 2
    const h = this.textObj.height + PADDING_Y * 2
    this.bg.clear()
    this.bg.fillStyle(0xffffff, 0.95)
    this.bg.lineStyle(1, 0x000000, 0.4)
    this.bg.fillRoundedRect(-w / 2, -h, w, h, CORNER_RADIUS)
    this.bg.strokeRoundedRect(-w / 2, -h, w, h, CORNER_RADIUS)

    // 아래쪽 삼각형 꼬리
    const tailW = 6
    const tailH = 4
    this.bg.fillTriangle(-tailW, 0, tailW, 0, 0, tailH)
    this.bg.lineStyle(1, 0x000000, 0.4)
    this.bg.lineBetween(-tailW, 0, 0, tailH)
    this.bg.lineBetween(tailW, 0, 0, tailH)

    // 텍스트를 배경 안에 정렬 (y=-PADDING_Y는 bottom 기준)
    this.textObj.setPosition(0, -PADDING_Y)
  }

  /** 일정 시간 후 자동 제거 */
  setAutoExpire(ms: number) {
    this.expireTimer?.remove()
    this.expireTimer = this.scene.time.delayedCall(ms, () => {
      this.destroy()
    })
  }

  override destroy(fromScene?: boolean) {
    this.expireTimer?.remove()
    this.expireTimer = null
    super.destroy(fromScene)
  }
}
