/**
 * TetrisScene (Phase 3)
 *
 * 60초 제한 테트리스. 게임오버 시 점수를 contribute_stadium_points RPC로 전송.
 */

import Phaser from "phaser"

export const TETRIS_SCENE_KEY = "Tetris"

export class TetrisScene extends Phaser.Scene {
  private stadiumId = ""

  constructor() {
    super(TETRIS_SCENE_KEY)
  }

  init(data: { stadiumId: string }) {
    this.stadiumId = data.stadiumId
  }

  create() {
    this.add
      .text(400, 280, `TetrisScene (Phase 3 pending)`, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
    this.add
      .text(400, 310, `stadium: ${this.stadiumId}`, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5)
  }
}
