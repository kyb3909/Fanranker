"use client"

/**
 * PlotActionOverlay — 내 아바타가 Plot 경계 안에 있을 때 하단에 뜨는 컨텍스트 버튼.
 *
 *  - 빈 Plot 위에 서있음 → "방 만들기" 버튼 (클릭 시 모달 트리거 예정)
 *  - 방이 있는 Plot 위에 서있음 → "🪧 {방이름} · 입장 중" 정보
 *  - Plot 밖 → 렌더링 안 함
 *
 * Phase 3.2 (현재): 버튼 자리만. 클릭 핸들러는 다음 커밋에서 모달/API 연결.
 */

import { useEffect, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

interface PlotContext {
  plotId: string
  plotCode: string
  plazaName: string
  roomId?: string
}

export function PlotActionOverlay({
  onCreateRoom,
  onEnterRoom,
}: {
  onCreateRoom?: (ctx: PlotContext) => void
  onEnterRoom?: (ctx: PlotContext) => void
}) {
  const [ctx, setCtx] = useState<PlotContext | null>(null)

  useEffect(() => {
    const unsubEnter = sceneBridge.on("plot:enter", (detail) => {
      if (detail) setCtx(detail)
    })
    const unsubLeave = sceneBridge.on("plot:leave", () => setCtx(null))
    return () => {
      unsubEnter()
      unsubLeave()
    }
  }, [])

  if (!ctx) return null

  if (ctx.roomId) {
    return (
      <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-[12px] text-white backdrop-blur-sm">
        <span aria-hidden>🪧</span>
        <span className="text-white/60">{ctx.plazaName} ·</span>
        <span className="font-semibold">입장 중</span>
        <button
          onClick={() => onEnterRoom?.(ctx)}
          className="ml-2 rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          자세히
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-[12px] text-white backdrop-blur-sm">
      <span className="text-white/60">
        빈 자리 · <span className="text-white/40">{ctx.plazaName}</span>
      </span>
      <button
        onClick={() => onCreateRoom?.(ctx)}
        className="bg-primary/90 hover:bg-primary rounded px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
      >
        방 만들기 · 100P
      </button>
    </div>
  )
}
