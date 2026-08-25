"use client"

/**
 * UserActionPopover — 원격 아바타 클릭 시 뜨는 작은 팝오버.
 *
 *  - Phaser 씬에서 user:clicked 이벤트 수신 (userId/nickname/화면 좌표)
 *  - 뮤트 토글 버튼 + 닫기
 *  - 외부 영역 클릭 또는 Esc 로 닫힘
 *  - 본인 자기 자신은 클릭되지 않게 scene 에서 필터링해도 되지만, 여기서도 방어
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { isMuted, onMuteChange, toggleMute } from "@/lib/metaverse/mute-list"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

interface PopoverCtx {
  userId: string
  nickname: string
  screenX: number
  screenY: number
}

export function UserActionPopover({ identity }: { identity: MetaversePlayerIdentity }) {
  const [ctx, setCtx] = useState<PopoverCtx | null>(null)
  const [muted, setMuted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 클릭 이벤트 구독
  useEffect(() => {
    const unsub = sceneBridge.on("user:clicked", (detail) => {
      if (!detail) return
      // 자기 자신 클릭 방어 — 원격 아바타만 click emit 되지만 일단 guard
      if (detail.userId === identity.userId) return
      setCtx(detail)
      setMuted(isMuted(detail.userId))
    })
    const unsubMute = onMuteChange(() => {
      setCtx((prev) => {
        if (!prev) return prev
        setMuted(isMuted(prev.userId))
        return prev
      })
    })
    return () => {
      unsub()
      unsubMute()
    }
  }, [identity.userId])

  const close = useCallback(() => setCtx(null), [])

  // 외부 클릭 / Esc 닫기
  useEffect(() => {
    if (!ctx) return
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    // 같은 클릭 이벤트에 즉시 닫히지 않도록 다음 tick 부터 등록
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onClick)
      window.addEventListener("keydown", onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onKey)
    }
  }, [ctx, close])

  if (!ctx) return null

  const onToggleMute = () => {
    const nowMuted = toggleMute(ctx.userId)
    setMuted(nowMuted)
    close()
  }

  const onReport = () => {
    if (!ctx) return
    sceneBridge.emit("user:report", { userId: ctx.userId, nickname: ctx.nickname })
    close()
  }

  // 화면 경계 밖으로 나가지 않게 대충 clamp (margin 40)
  const left = Math.min(Math.max(ctx.screenX - 80, 8), window.innerWidth - 168)
  const top = Math.max(ctx.screenY - 100, 8)

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`${ctx.nickname} 작업`}
      className="absolute z-50 w-40 rounded-md border border-white/15 bg-neutral-900/95 p-2 shadow-2xl backdrop-blur-sm"
      style={{ left, top }}
    >
      <div className="border-b border-white/10 px-1 pb-2 text-[12px] font-semibold break-all text-white">
        {ctx.nickname}
      </div>
      <button
        onClick={onToggleMute}
        className={`mt-1 flex w-full items-center rounded px-2 py-1.5 text-[12px] transition-colors ${
          muted ? "text-white/80 hover:bg-white/10" : "text-amber-200 hover:bg-amber-500/15"
        }`}
      >
        <span>{muted ? "🔔 뮤트 해제" : "🔇 뮤트"}</span>
      </button>
      <button
        onClick={onReport}
        className="mt-0.5 flex w-full items-center rounded px-2 py-1.5 text-[12px] text-red-200 transition-colors hover:bg-red-500/20"
      >
        <span>🚩 신고</span>
      </button>
      <button
        onClick={close}
        className="mt-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-[12px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        <span>닫기</span>
        <span className="text-[9px] text-white/30">Esc</span>
      </button>
    </div>
  )
}
