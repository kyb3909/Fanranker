"use client"

import { useEffect, useRef } from "react"
import type Phaser from "phaser"
import { GAME_WIDTH, GAME_HEIGHT, GAME_BG_COLOR } from "@/lib/stadium/game/config"

export interface GameCanvasProps {
  /** 초기 진입 씬 key (WorldMap | StadiumChat | Tetris) */
  initialScene?: string
  /** 초기 씬에 전달할 데이터 */
  initialSceneData?: Record<string, unknown>
  /** 부모 컨테이너 className */
  className?: string
}

/**
 * Phaser 게임 캔버스 React 래퍼.
 *
 * Phaser/씬 모듈은 클라이언트에서만 로드되어야 하므로 useEffect 안에서
 * 동적 import. next/dynamic({ ssr: false })로 이 컴포넌트 자체도 감싸서 사용할 것.
 */
export function GameCanvas({
  initialScene = "WorldMap",
  initialSceneData,
  className,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    // Phaser + 씬을 동적 import (SSR 회피 + 초기 번들 분리)
    // Phaser 4는 named exports만 제공 (v3의 default export 폐기)
    const loadGame = async () => {
      const [Phaser, scenesModule] = await Promise.all([
        import("phaser"),
        import("@/lib/stadium/game/scenes"),
      ])
      if (cancelled || !containerRef.current) return

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: GAME_BG_COLOR,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        scene: [scenesModule.WorldMapScene, scenesModule.StadiumChatScene],
      })

      gameRef.current = game

      // initialScene이 기본이 아닌 경우 start로 전환
      if (initialScene !== "WorldMap") {
        game.scene.start(initialScene, initialSceneData ?? {})
      } else if (initialSceneData) {
        // 기본 씬에도 데이터 주입 필요 시
        game.scene.start("WorldMap", initialSceneData)
      }
    }

    void loadGame()

    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [initialScene, initialSceneData])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", maxWidth: GAME_WIDTH, aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}` }}
    />
  )
}
