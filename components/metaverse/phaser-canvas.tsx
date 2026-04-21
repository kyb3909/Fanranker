"use client"

/**
 * PhaserCanvas — Phaser Game 인스턴스를 React 라이프사이클에 물린 마운트 컴포넌트.
 *
 * 책임:
 *  - Phaser 동적 로드 (SSR 방지 + 초기 번들 분리)
 *  - Supabase Realtime WorldChannel 생성/연결/해제
 *  - 게임 인스턴스 lifecycle 관리
 */

import { useEffect, useRef, useState } from "react"
import { createAnonClient } from "@/lib/supabase/client"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export function PhaserCanvas({ identity }: { identity: MetaversePlayerIdentity }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const channelRef = useRef<{ disconnect: () => Promise<void> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready">("loading")

  useEffect(() => {
    if (!parentRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        // 1) Realtime 채널 먼저 연결 (boot 전에 준비)
        const [{ WorldChannel }, { bootMetaverseGame }] = await Promise.all([
          import("@/lib/metaverse/realtime/world-channel"),
          import("@/lib/metaverse/boot"),
        ])
        if (cancelled) return

        const supabase = createAnonClient()
        const channel = new WorldChannel(supabase, identity)
        try {
          await channel.connect()
        } catch (err) {
          // Realtime 실패해도 싱글플레이어로는 동작 가능 — 경고만 남기고 진행
          console.warn("[metaverse] realtime connect failed (offline mode)", err)
        }
        if (cancelled) {
          await channel.disconnect().catch(() => {})
          return
        }
        channelRef.current = channel

        // 2) Phaser 게임 부팅 — 채널 주입
        if (!parentRef.current) return
        gameRef.current = bootMetaverseGame({
          parent: parentRef.current,
          identity,
          channel,
        })
        setStatus("ready")
      } catch (err) {
        console.error("[metaverse] boot failed", err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
      channelRef.current?.disconnect().catch(() => {})
      channelRef.current = null
    }
  }, [identity])

  if (error) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div>
          <p className="text-sm font-semibold text-red-400">게임 엔진 로드 실패</p>
          <p className="mt-2 text-xs text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[100svh] w-screen bg-neutral-950">
      <div ref={parentRef} className="h-full w-full" aria-label="경기장 메타버스 월드맵" />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/60">
          <span className="text-sm">월드맵 로딩 중…</span>
        </div>
      )}
      {/* 좌상단 데브 정보 */}
      <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/70">
        {identity.nickname} · {identity.userId.startsWith("guest-") ? "🧪 guest" : "signed in"}
      </div>
    </div>
  )
}
