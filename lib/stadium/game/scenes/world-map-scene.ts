/**
 * WorldMapScene (Phase 1)
 *
 * 세계 지도 + 경기장 핀. 핀 클릭 시 StadiumChatScene 전환.
 *
 * 주의: 이 모듈은 Phaser에 의존하므로 클라이언트 전용 경로에서만 import되어야 한다.
 * GameCanvas.tsx의 dynamic import 체인을 통해서만 로드됨.
 */

import Phaser from "phaser"

export const WORLD_MAP_SCENE_KEY = "WorldMap"

interface StadiumPinData {
  id: string
  name: string
  x: number
  y: number
}

/**
 * Phase 1 skeleton — 실제 핀/에셋 데이터는 Phase 1 본작업에서 주입.
 * 현재는 빈 씬 뼈대만 export.
 */
export class WorldMapScene extends Phaser.Scene {
  private pins: StadiumPinData[] = []

  constructor() {
    super(WORLD_MAP_SCENE_KEY)
  }

  init(data: { pins?: StadiumPinData[] }) {
    this.pins = data.pins ?? []
  }

  preload() {
    // Phase 1 본작업에서 world-map.png / pin.png 로드
  }

  create() {
    // Phase 1 본작업에서 배경 + 핀 + 카메라 드래그 구현
    this.add
      .text(400, 300, "WorldMapScene (Phase 1 pending)", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5)

    // 핀 수 표시만 (데이터 주입 확인용)
    if (this.pins.length > 0) {
      this.add
        .text(400, 330, `pins: ${this.pins.length}`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#aaaaaa",
        })
        .setOrigin(0.5)
    }
  }
}
