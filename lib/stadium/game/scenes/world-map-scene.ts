/**
 * WorldMapScene — Phaser 게임 내 진입점 (preview 전용)
 *
 * 실제 World Map UI는 기존 Canvas 기반 components/stadium/region-map.tsx가 담당.
 * 이 씬은 Phaser 단독 preview 라우트(/stadium/chat-preview 등)에서 Chat Room으로
 * 전환하기 위한 간이 진입 화면으로만 사용.
 */

import * as Phaser from "phaser"
import { STADIUM_CHAT_SCENE_KEY } from "./stadium-chat-scene"

export const WORLD_MAP_SCENE_KEY = "WorldMap"

export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super(WORLD_MAP_SCENE_KEY)
  }

  create() {
    this.cameras.main.setBackgroundColor("#1a1a2e")

    this.add
      .text(400, 220, "Gongnori Stadium — Phaser Preview", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5)

    this.add
      .text(400, 260, "World Map은 기존 region-map.tsx에서 담당", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5)

    const btn = this.add
      .text(400, 340, "[ 경기장 채팅방 입장 ]", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#2962ff",
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#1e52e6" }))
    btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#2962ff" }))
    btn.on("pointerdown", () => {
      this.scene.start(STADIUM_CHAT_SCENE_KEY, {
        stadiumId: "preview",
        stadiumName: "프리뷰 경기장",
      })
    })
  }
}
