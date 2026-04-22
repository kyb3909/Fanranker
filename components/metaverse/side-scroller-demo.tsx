"use client"

/**
 * SideScrollerDemo — 사이드스크롤러 씬 단독 프로토타입 (Phase 4 선행).
 *
 * 월드맵 (phaser-canvas) 과 독립. Clerk/WorldChannel/Plot 전부 생략 —
 * 단순히 Phaser 사이드뷰 씬 하나만 띄워서 조작감/느낌 검증.
 * OK 면 PixelLab 사이드뷰 캐릭터 + 배경 PNG 교체하고, 월드맵에서 씬
 * 전환으로 편입.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export function SideScrollerDemo() {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 간단 데모 identity — Clerk 우회 (demo 라우트 전용)
  const identity = useMemo<MetaversePlayerIdentity>(() => {
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    return { userId: `demo-${rand}`, nickname: `데모-${rand}` }
  }, [])

  useEffect(() => {
    if (!parentRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const { bootSideScrollerDemo } = await import("@/lib/metaverse/boot")
        if (cancelled || !parentRef.current) return
        gameRef.current = bootSideScrollerDemo({ parent: parentRef.current, identity })
      } catch (err) {
        console.error("[metaverse] side-scroller boot failed", err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [identity])

  if (error) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div>
          <p className="text-sm font-semibold text-red-400">씬 로드 실패</p>
          <p className="mt-2 text-xs text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[100svh] w-screen bg-neutral-950">
      <div ref={parentRef} className="h-full w-full" aria-label="사이드스크롤러 프로토타입" />
      <Link
        href="/metaverse"
        className="absolute top-2 right-2 rounded bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-sm transition-colors hover:text-white"
      >
        ← 월드맵으로
      </Link>
      <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/60">
        Phase 4 프로토타입 · 단독 씬
      </div>
    </div>
  )
}
