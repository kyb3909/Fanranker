"use client"

import dynamic from "next/dynamic"

/**
 * GameCanvas의 SSR-safe 진입점.
 *
 * Phaser는 window/document에 의존하므로 서버에서 import되면 빌드/hydration 실패.
 * 페이지 컴포넌트는 이 모듈만 import할 것.
 */
export const GameCanvasDynamic = dynamic(() => import("./game-canvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div
      className="bg-muted flex items-center justify-center rounded"
      style={{ aspectRatio: "4 / 3", width: "100%", maxWidth: 800 }}
    >
      <span className="text-muted-foreground text-sm">게임 로딩 중...</span>
    </div>
  ),
})
