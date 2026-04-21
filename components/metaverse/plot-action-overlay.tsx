"use client"

/**
 * PlotActionOverlay — 내 아바타가 Plot 경계 안에 있을 때 하단 컨텍스트 바.
 *
 *  - 빈 Plot → "방 만들기 · 100P" 버튼
 *  - 방이 있는 Plot
 *    - 방장이면 → "방 닫기" 버튼 추가
 *    - 일반 입장자 → "입장 중" 표시만
 *  - Plot 밖 → 렌더링 안 함
 */

import { useEffect, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/auth"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

interface PlotContext {
  plotId: string
  plotCode: string
  plazaName: string
  roomId?: string
  ownerUserId?: string
}

export function PlotActionOverlay({
  identity,
  onCreateRoom,
  onEnterRoom,
}: {
  identity: MetaversePlayerIdentity
  onCreateRoom?: (ctx: PlotContext) => void
  onEnterRoom?: (ctx: PlotContext) => void
}) {
  const [ctx, setCtx] = useState<PlotContext | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const unsubEnter = sceneBridge.on("plot:enter", (detail) => {
      if (detail) setCtx(detail)
    })
    const unsubLeave = sceneBridge.on("plot:leave", () => {
      setCtx(null)
      setClosing(false)
    })
    return () => {
      unsubEnter()
      unsubLeave()
    }
  }, [])

  if (!ctx) return null

  // 방 있는 Plot
  if (ctx.roomId) {
    const isOwner = ctx.ownerUserId === identity.userId

    const closeRoom = async () => {
      if (!ctx.roomId) return
      if (!window.confirm("정말 이 방을 닫을까요? 활동 포인트는 반환되지 않습니다.")) return
      setClosing(true)
      try {
        const headers: HeadersInit = {}
        if (identity.userId.startsWith("guest-")) {
          headers[METAVERSE_GUEST_HEADER] = identity.userId
        }
        const res = await fetch(`/api/metaverse/chat-rooms/${ctx.roomId}`, {
          method: "DELETE",
          headers,
        })
        if (!res.ok) {
          console.warn("[metaverse] delete room failed", await res.text().catch(() => ""))
        }
        // 성공 시 서버 broadcast 에서 room:closed 수신 → Signboard/PlotActionOverlay 자동 업데이트
      } catch (err) {
        console.error("[metaverse] delete room failed", err)
      } finally {
        setClosing(false)
      }
    }

    return (
      <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-[12px] text-white backdrop-blur-sm">
        <span aria-hidden>🪧</span>
        <span className="text-white/60">{ctx.plazaName} ·</span>
        <span className="font-semibold">입장 중</span>
        <button
          onClick={() => onEnterRoom?.(ctx)}
          className="ml-1 rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          자세히
        </button>
        {isOwner && (
          <button
            onClick={closeRoom}
            disabled={closing}
            className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200 transition-colors hover:bg-red-500/20 hover:text-red-100 disabled:opacity-40"
          >
            {closing ? "닫는 중…" : "방 닫기"}
          </button>
        )}
      </div>
    )
  }

  // 빈 Plot
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
