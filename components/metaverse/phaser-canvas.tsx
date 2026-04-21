"use client"

/**
 * PhaserCanvas — Phaser Game 인스턴스를 React 라이프사이클에 물린 마운트 컴포넌트.
 *
 * Phaser는 SSR 불가능하므로 `next/dynamic` + `ssr: false`로 import 해야 한다.
 * (상위 `metaverse-stage.tsx`에서 처리)
 */

import { useEffect, useRef, useState } from "react"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export function PhaserCanvas({ identity }: { identity: MetaversePlayerIdentity }) {
  const parentRef = useRef<HTMLDivElement>(null)
  // Phaser.Game 전체 타입을 여기서 import 하면 Phaser가 초기 번들에 들어가므로
  // destroy 시그니처만 최소 타입으로 선언 (dynamic import 유지).
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!parentRef.current) return

    let cancelled = false

    // boot.ts는 Phaser를 import하므로 반드시 dynamic import (번들 분리 + SSR 방지)
    import("@/lib/metaverse/boot")
      .then(({ bootMetaverseGame }) => {
        if (cancelled || !parentRef.current) return
        try {
          gameRef.current = bootMetaverseGame({ parent: parentRef.current, identity })
        } catch (err) {
          console.error("[metaverse] boot failed", err)
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .catch((err) => {
        console.error("[metaverse] dynamic import failed", err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

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
          <p className="text-sm font-semibold text-red-400">게임 엔진 로드 실패</p>
          <p className="mt-2 text-xs text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-[100svh] w-screen bg-neutral-950"
      aria-label="경기장 메타버스 월드맵"
    />
  )
}
