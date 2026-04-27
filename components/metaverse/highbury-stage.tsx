"use client"

/**
 * HighburyStage — 하이버리 외관 + 클럭 엔드 내부 사이드뷰 메타버스.
 *
 * 같은 씬 인스턴스가 mapId 만 바꾸며 재시작 → 부드러운 페이드 전환.
 * 도어 위로 가서 ↑ / W 누르면 다음 맵으로 이동.
 *
 * 멀티플레이/채팅/킥 없음. 탐험 전용 MVP.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import { ARSENAL_HOME_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { MetaverseHud } from "./metaverse-hud"

export function HighburyStage() {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 게스트 identity — Clerk 통합은 차후 (방문객 모드)
  const identity = useMemo<MetaversePlayerIdentity>(() => {
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    return {
      userId: `guest-highbury-${rand}`,
      nickname: `방문객-${rand}`,
      avatarKey: ARSENAL_HOME_AVATAR_KEY,
    }
  }, [])

  useEffect(() => {
    if (!parentRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const { bootIndoorMap } = await import("@/lib/metaverse/boot")
        if (cancelled || !parentRef.current) return
        gameRef.current = bootIndoorMap({
          parent: parentRef.current,
          identity,
          mapId: "highbury",
        })
      } catch (err) {
        console.error("[highbury] boot failed", err)
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
    <div className="relative mx-auto h-[calc(100svh-3.5rem)] w-full max-w-[1280px] bg-neutral-950">
      <div ref={parentRef} className="h-full w-full" aria-label="하이버리 메타버스" />
      <MetaverseHud
        locationLabel="🏟️ 하이버리"
        actions={
          <Link
            href="/metaverse/uk"
            className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-black/80 hover:text-white"
          >
            ← 월드맵
          </Link>
        }
      />
      {/* 조작 안내 — 우하단에 짧게 */}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-black/65 px-3 py-1.5 text-[10px] text-white/70 shadow-lg backdrop-blur-sm">
        A/D · ←→ 이동 · Space 점프 · 도어 앞에서 W/↑ 진입
      </div>
    </div>
  )
}
