"use client"

/**
 * MetaverseStage — 메타버스 최상위 React 래퍼.
 *
 * 동작 모드:
 *  1. 로그인 완료 → 실제 Clerk user.id + 프로필 닉네임으로 진입
 *  2. 비로그인 + **dev 환경** → 랜덤 guest 식별자로 바로 진입 (로컬 테스트용)
 *  3. 비로그인 + 프로덕션 → 로그인 유도 CTA
 *
 * guest 모드는 `process.env.NODE_ENV === "development"` 에서만 활성화됨.
 * 프로덕션 빌드엔 dead code로 제거될 수 있게 설계.
 */

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

const PhaserCanvas = dynamic(
  () => import("./phaser-canvas").then((m) => ({ default: m.PhaserCanvas })),
  { ssr: false, loading: () => <LoadingScreen stage="Phaser 번들 로드 중…" /> }
)

// dev에서만 활성. 프로덕션 번들에선 tree-shake 기대.
const DEV_GUEST_MODE = process.env.NODE_ENV === "development"

export function MetaverseStage() {
  const { user, isLoaded, isSignedIn } = useUser()
  const [identity, setIdentity] = useState<MetaversePlayerIdentity | null>(null)
  const searchParams = useSearchParams()
  // Deep-link: /metaverse?plot=london-03 진입 시 해당 Plot 에 스폰
  const initialPlotCode =
    searchParams
      ?.get("plot")
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "") ?? null

  // 세션 수명 guest identity — 탭 유지되는 동안 동일
  const guestIdentity = useMemo<MetaversePlayerIdentity | null>(() => {
    if (!DEV_GUEST_MODE) return null
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    return {
      userId: `guest-${typeof crypto !== "undefined" ? crypto.randomUUID().slice(0, 8) : rand}`,
      nickname: `게스트-${rand}`,
    }
  }, [])

  useEffect(() => {
    // 1) Clerk 로드 완료 + 로그인 → 프로필 기반 identity로 업그레이드
    if (isLoaded && isSignedIn && user) {
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
    }

    // 2) dev 모드: Clerk 상태와 무관하게 guest로 즉시 진입.
    //    localhost에서 Clerk 프로덕션 키가 init 실패하면 isLoaded가 영원히 false일 수 있음 —
    //    이 경로가 그 락을 우회.
    if (DEV_GUEST_MODE && guestIdentity) {
      setIdentity(guestIdentity)
    }
  }, [isLoaded, isSignedIn, user, guestIdentity])

  if (!isLoaded && !DEV_GUEST_MODE) return <LoadingScreen stage="Clerk 인증 초기화 중…" />

  // 비로그인 + 프로덕션 → 로그인 유도
  if (!isSignedIn && !DEV_GUEST_MODE) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold">경기장 메타버스</h1>
          <p className="mt-3 text-sm text-white/70">
            로그인 후 이용할 수 있습니다.
            <br />
            <span className="text-white/50">내부 테스트 중인 기능입니다.</span>
          </p>
          <Link
            href="/sign-up"
            className="bg-primary mt-6 inline-block rounded-md px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            로그인
          </Link>
        </div>
      </div>
    )
  }

  if (!identity) return <LoadingScreen stage="identity 설정 중…" />

  return <PhaserCanvas identity={identity} initialPlotCode={initialPlotCode} />
}

function LoadingScreen({ stage }: { stage?: string }) {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-neutral-950">
      <div className="text-center text-white/70">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-white/40 uppercase">
          Stadium Metaverse
        </p>
        <p className="mt-2 text-sm">{stage ?? "월드맵 로딩 중…"}</p>
      </div>
    </div>
  )
}
