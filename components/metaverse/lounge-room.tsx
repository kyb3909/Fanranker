"use client"

/**
 * LoungeRoom — 팬 라운지 (정식 멀티유저 채팅방).
 *
 * SideScrollerDemo(데모 게스트 전용)의 정식 버전:
 *  - Clerk 로그인 유저만 입장 — 실제 닉네임(profiles) + 실제 userId 로 presence
 *  - 입장 시 본인 "장착 아바타"(/api/metaverse/avatar/me equipped) 로 스폰 —
 *    유니폼 상점에서 갈아입으면 즉시 반영 (씬 재부팅)
 *  - 전용 Realtime 채널 (METAVERSE.CHANNEL_LOUNGE) — 데모 방과 분리.
 *    'metaverse:%' RLS 정책이 이미 프로덕션에 적용돼 있어 presence/broadcast 동작.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { createAnonClient } from "@/lib/supabase/client"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import type { SideScrollerChannel } from "@/lib/metaverse/realtime/sidescroll-channel"
import { METAVERSE } from "@/lib/metaverse/constants"
import { ChatOverlay } from "./chat-overlay"
import { ChatLogPanel } from "./chat-log-panel"
import { UserActionPopover } from "./user-action-popover"
import { ReportUserDialog, type ReportTarget } from "./report-user-dialog"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { AvatarShopModal } from "./avatar-shop-modal"
import { DEFAULT_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { MetaverseHud } from "./metaverse-hud"

export function LoungeRoom() {
  const { isLoaded, isSignedIn, user } = useUser()
  // Clerk isLoaded 는 SSR true/hydration false 로 텍스트가 갈려 React #418 을 유발할 수 있어
  // mounted 게이트로 클라이언트 마운트 후에만 인증 분기 렌더 (2026-06-24 동일 패턴).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const channelRef = useRef<SideScrollerChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [shopOpen, setShopOpen] = useState(false)
  // null = 아직 로드 전 (씬 부팅 보류 — 닉네임/아바타 없이 부팅했다 재부팅하는 깜빡임 방지)
  const [profileNickname, setProfileNickname] = useState<string | null>(null)
  const [equippedAvatarKey, setEquippedAvatarKey] = useState<string | null>(null)

  // 입장 준비: 프로필 닉네임 + 장착 아바타를 병렬 로드
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    ;(async () => {
      const [profileRes, avatarRes] = await Promise.all([
        fetch("/api/profile/me", { cache: "no-store" }).catch(() => null),
        fetch("/api/metaverse/avatar/me", { cache: "no-store" }).catch(() => null),
      ])
      if (cancelled) return
      let nickname = ""
      if (profileRes?.ok) {
        const data = await profileRes.json()
        nickname = typeof data?.nickname === "string" ? data.nickname : ""
      }
      if (!nickname) nickname = user?.username || "구너"
      let avatarKey = DEFAULT_AVATAR_KEY as string
      if (avatarRes?.ok) {
        const data = (await avatarRes.json()) as { equippedAvatarKey?: string }
        if (data?.equippedAvatarKey) avatarKey = data.equippedAvatarKey
      }
      if (cancelled) return
      setProfileNickname(nickname)
      setEquippedAvatarKey(avatarKey)
    })()
    return () => {
      cancelled = true
    }
  }, [isSignedIn, user?.username])

  useEffect(() => {
    const unsub = sceneBridge.on("user:report", (payload) => {
      if (payload) setReportTarget({ userId: payload.userId, nickname: payload.nickname })
    })
    return () => unsub()
  }, [])

  const identity = useMemo<MetaversePlayerIdentity | null>(() => {
    if (!isSignedIn || !user?.id || profileNickname === null || equippedAvatarKey === null)
      return null
    return { userId: user.id, nickname: profileNickname, avatarKey: equippedAvatarKey }
  }, [isSignedIn, user?.id, profileNickname, equippedAvatarKey])

  useEffect(() => {
    if (!identity || !parentRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const [{ bootSideScrollerDemo }, { SideScrollerChannel }] = await Promise.all([
          import("@/lib/metaverse/boot"),
          import("@/lib/metaverse/realtime/sidescroll-channel"),
        ])
        if (cancelled) return

        // Realtime 채널 — 실패해도 방은 부팅 (싱글플레이 fallback)
        const supabase = createAnonClient()
        const channel = new SideScrollerChannel(supabase, identity, METAVERSE.CHANNEL_LOUNGE)
        try {
          await channel.connect()
          channelRef.current = channel
        } catch (err) {
          console.warn("[lounge] realtime connect failed — singleplayer mode", err)
          channelRef.current = null
        }
        if (cancelled) {
          await channel.disconnect().catch(() => {})
          return
        }

        if (!parentRef.current) return
        gameRef.current = bootSideScrollerDemo({
          parent: parentRef.current,
          identity,
          channel: channelRef.current,
        })
      } catch (err) {
        console.error("[lounge] boot failed", err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
      void channelRef.current?.disconnect()
      channelRef.current = null
    }
  }, [identity])

  const handleEquipped = useCallback((avatarKey: string) => {
    // 상점 장착 성공 → identity memo 재계산 → 씬 재부팅으로 즉시 반영
    setEquippedAvatarKey(avatarKey)
  }, [])

  if (!mounted || !isLoaded) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 text-sm text-white/60">
        라운지 입장 준비 중…
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-2xl">🛋️</p>
          <h1 className="mt-3 text-lg font-bold">팬 라운지</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            내 아바타로 입장해서 다른 팬들과 실시간으로 채팅하는 공간이에요.
            <br />
            로그인 후 입장할 수 있어요 — 우측 상단에서 로그인해주세요.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
          >
            홈으로
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div>
          <p className="text-sm font-semibold text-red-400">라운지 입장 실패</p>
          <p className="mt-2 text-xs text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto h-[calc(100svh-3.5rem)] w-full max-w-[1280px] bg-neutral-950">
      <div ref={parentRef} className="h-full w-full" aria-label="팬 라운지" />
      {!identity && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
          아바타 불러오는 중…
        </div>
      )}
      <MetaverseHud
        locationLabel="🛋️ 팬 라운지"
        actions={
          <button
            onClick={() => setShopOpen(true)}
            className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-black/80"
          >
            👕 유니폼 상점
          </button>
        }
      />
      {identity && (
        <>
          {/* Enter 로 입력 → 내 머리 위 말풍선 + 로그 패널 (Realtime broadcast) */}
          <ChatOverlay canSend={true} />
          <ChatLogPanel identity={identity} />
          <UserActionPopover identity={identity} />
          <ReportUserDialog
            target={reportTarget}
            identity={identity}
            onClose={() => setReportTarget(null)}
          />
          <AvatarShopModal
            open={shopOpen}
            onClose={() => setShopOpen(false)}
            onEquipped={handleEquipped}
            currentAvatarKey={identity.avatarKey}
          />
        </>
      )}
    </div>
  )
}
