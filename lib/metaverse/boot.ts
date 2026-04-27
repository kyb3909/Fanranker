/**
 * Phaser Game 인스턴스 팩토리.
 *
 * `import("phaser")`는 크기가 크므로 이 모듈은 반드시 dynamic import로 로드 (React SSR 방지).
 * `components/metaverse/phaser-canvas.tsx` 에서 `useEffect` 내부에서 호출.
 */

import * as Phaser from "phaser"
import {
  WorldMapScene,
  WORLD_MAP_SCENE_KEY,
  SideScrollerScene,
  SIDE_SCROLLER_SCENE_KEY,
  IndoorMapScene,
  INDOOR_MAP_SCENE_KEY,
} from "./scenes"
import { METAVERSE } from "./constants"
import type { ChatRoomMeta, MetaversePlayerIdentity, WorldPlot } from "./types"
import type { WorldChannel } from "./realtime/world-channel"
import type { SideScrollerChannel } from "./realtime/sidescroll-channel"
import type { MapId } from "./maps/map-config"

export interface BootOptions {
  parent: HTMLElement
  identity: MetaversePlayerIdentity
  channel?: WorldChannel | null
  plots?: WorldPlot[]
  rooms?: ChatRoomMeta[]
  /** Deep-link: /metaverse?plot=london-03 로 진입 시 해당 Plot 에 스폰 */
  initialPlotCode?: string
}

export function bootMetaverseGame({
  parent,
  identity,
  channel = null,
  plots = [],
  rooms = [],
  initialPlotCode,
}: BootOptions): Phaser.Game {
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

  // 씬 시작 — identity + realtime 채널 + Plot/Room 초기 데이터 + deep-link 전달
  game.scene.start(WORLD_MAP_SCENE_KEY, {
    identity,
    channel,
    plots,
    rooms,
    initialPlotCode,
  })
  return game
}

/**
 * 사이드스크롤러 프로토타입 부팅 (Phase 4 선행 데모).
 * 월드맵 씬과 다른 게임 인스턴스 — 중력/씬 구성 독립.
 */
export interface SideScrollerBootOptions {
  parent: HTMLElement
  identity: MetaversePlayerIdentity
  /** 옵셔널 — Realtime 채널. null/undefined 면 싱글플레이 fallback. */
  channel?: SideScrollerChannel | null
}

export function bootSideScrollerDemo({
  parent,
  identity,
  channel = null,
}: SideScrollerBootOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: "#1a1f2e",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 }, // 씬 내부에서 per-scene 지정
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    pixelArt: true,
    render: { antialias: false },
    scene: [SideScrollerScene],
    dom: { createContainer: false },
  })
  game.scene.start(SIDE_SCROLLER_SCENE_KEY, { identity, channel })
  return game
}

/**
 * Indoor map (Highbury / Clockend 등) 부팅. 데이터 기반 사이드뷰 씬으로,
 * mapId 만 바꾸면 동일 씬이 재시작되며 페이드 전환됨.
 */
export interface IndoorMapBootOptions {
  parent: HTMLElement
  identity: MetaversePlayerIdentity
  mapId: MapId
}

export function bootIndoorMap({ parent, identity, mapId }: IndoorMapBootOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: "#000",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 }, // 씬 내부에서 per-scene 지정
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    pixelArt: true,
    render: { antialias: false },
    scene: [IndoorMapScene],
    dom: { createContainer: false },
  })
  game.scene.start(INDOOR_MAP_SCENE_KEY, { identity, mapId })
  return game
}

export { METAVERSE }
