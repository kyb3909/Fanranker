"use client"

/**
 * MetaverseStage — 메타버스 최상위 React 래퍼.
 *
 * Phase 1a (현재): Clerk 인증 게이트 → PhaserCanvas 동적 로드 → 단일 플레이어 월드맵.
 * Phase 1b 계획: Realtime Presence + proximity 채팅.
 *
 * 원칙: 이 컴포넌트는 /metaverse 라우트 전용. 기존 사이트 페이지에서 import 금지.
 */

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useUser } from "@clerk/nextjs"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

// Phaser는 SSR 불가 — 반드시 동적 로드
const PhaserCanvas = dynamic(
  () => import("./phaser-canvas").then((m) => ({ default: m.PhaserCanvas })),
  { ssr: false, loading: () => <LoadingScreen /> }
)

export function MetaverseStage() {
  const { user, isLoaded, isSignedIn } = useUser()
  const [identity, setIdentity] = useState<MetaversePlayerIdentity | null>(null)

  // 프로필 닉네임 (server profile 우선, 없으면 Clerk fullName)
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/profile/me")
        const data = res.ok ? await res.json() : null
        const nickname = data?.nickname || user.fullName || user.username || "플레이어"
        if (!cancelled) setIdentity({ userId: user.id, nickname })
      } catch {
        if (!cancelled)
          setIdentity({
            userId: user.id,
            nickname: user.fullName || user.username || "플레이어",
          })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, user])

  if (!isLoaded) return <LoadingScreen />

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold">경기장 메타버스</h1>
          <p className="mt-3 text-sm text-white/70">
            로그인 후 이용할 수 있습니다.
            <br />
            <span className="text-white/50">내부 테스트 중인 기능입니다.</span>
          </p>
          <a
            href="/sign-in"
            className="bg-primary mt-6 inline-block rounded-md px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            로그인
          </a>
        </div>
      </div>
    )
  }

  if (!identity) return <LoadingScreen />

  return <PhaserCanvas identity={identity} />
}

function LoadingScreen() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-neutral-950">
      <div className="text-center text-white/70">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-white/40 uppercase">
          Stadium Metaverse
        </p>
        <p className="mt-2 text-sm">월드맵 로딩 중…</p>
      </div>
    </div>
  )
}
