/**
 * Phaser Game 인스턴스 팩토리.
 *
 * `import("phaser")`는 크기가 크므로 이 모듈은 반드시 dynamic import로 로드 (React SSR 방지).
 * `components/metaverse/phaser-canvas.tsx` 에서 `useEffect` 내부에서 호출.
 */

import * as Phaser from "phaser"
import { WorldMapScene, WORLD_MAP_SCENE_KEY } from "./scenes"
import { METAVERSE } from "./constants"
import type { MetaversePlayerIdentity } from "./types"

export interface BootOptions {
  parent: HTMLElement
  identity: MetaversePlayerIdentity
}

export function bootMetaverseGame({ parent, identity }: BootOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: "#1a1f2e",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // pixel-art 느낌 유지 (블러 제거)
    pixelArt: true,
    render: { antialias: false },
    scene: [WorldMapScene],
    // dom UI 필요시 활성화 (Phase 2에서)
    dom: { createContainer: false },
  })

  // 씬 시작 — identity 전달
  game.scene.start(WORLD_MAP_SCENE_KEY, { identity })
  return game
}

export { METAVERSE }
