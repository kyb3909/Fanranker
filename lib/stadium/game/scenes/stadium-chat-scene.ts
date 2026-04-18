/**
 * StadiumChatScene (Phase 2)
 *
 * 사이드스크롤러 뷰 — 아바타 이동 + 채팅 + 미니게임 존 트리거.
 * Supabase Realtime으로 다른 유저 아바타 동기화.
 */

import Phaser from "phaser"

export const STADIUM_CHAT_SCENE_KEY = "StadiumChat"

export class StadiumChatScene extends Phaser.Scene {
  private stadiumId = ""
  private stadiumName = ""

  constructor() {
    super(STADIUM_CHAT_SCENE_KEY)
  }

  init(data: { stadiumId: string; stadiumName: string }) {
    this.stadiumId = data.stadiumId
    this.stadiumName = data.stadiumName
  }

  create() {
    this.add
      .text(400, 280, `StadiumChatScene (Phase 2 pending)`, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
    this.add
      .text(400, 310, `stadium: ${this.stadiumId} (${this.stadiumName})`, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5)
  }
}
