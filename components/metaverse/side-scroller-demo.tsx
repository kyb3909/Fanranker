"use client"

/**
 * SideScrollerDemo — 사이드스크롤러 멀티플레이어 씬.
 *
 * Realtime SideScrollerChannel 연결해 원격 유저·공유 공·채팅 이벤트 동기화.
 * 실패 시 싱글플레이 fallback. Clerk 로그인 있으면 본인 닉네임, 없으면 `demo-XXXX` 게스트.
 *
 * 유니폼(아바타 프리셋) 은 /api/metaverse/avatar/me 에서 본인 장착 키를 받아 identity 에 얹음.
 * 상점에서 장착 변경 시 equippedAvatarKey state 가 바뀌면 useEffect 재실행으로 씬 재부팅.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createAnonClient } from "@/lib/supabase/client"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import type { SideScrollerChannel } from "@/lib/metaverse/realtime/sidescroll-channel"
import { ChatOverlay } from "./chat-overlay"
import { ChatLogPanel } from "./chat-log-panel"
import { UserActionPopover } from "./user-action-popover"
import { ReportUserDialog, type ReportTarget } from "./report-user-dialog"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { AvatarShopModal, AVATAR_EQUIP_LOCAL_KEY } from "./avatar-shop-modal"
import { ARSENAL_HOME_AVATAR_KEY, DEFAULT_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"

/** 데모·게스트 기본 유니폼 — 마이그레이션 전 테스트용으로 아스날 홈킷 고정. */
const DEMO_FALLBACK_AVATAR_KEY = ARSENAL_HOME_AVATAR_KEY

export function SideScrollerDemo() {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const channelRef = useRef<SideScrollerChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [shopOpen, setShopOpen] = useState(false)
  const [equippedAvatarKey, setEquippedAvatarKey] = useState<string>(DEMO_FALLBACK_AVATAR_KEY)

  // 초기 장착 아바타 로드 — 서버 우선, 실패 시 localStorage (게스트), 둘 다 없으면 데모 기본.
  // 서버가 DEFAULT 를 반환했는데 localStorage 에도 없으면 "명시적으로 default 선택" vs "아직 선택 안 함"
  // 구분 못 함 → 데모 편의상 아스날을 기본으로 띄우고, 상점 통해 default 로 바꿀 수 있게 함.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/metaverse/avatar/me", { cache: "no-store" })
        if (!res.ok) throw new Error("me_failed")
        const data = (await res.json()) as { equippedAvatarKey: string; isGuest: boolean }
        if (cancelled) return
        const ls =
          typeof window !== "undefined" ? window.localStorage.getItem(AVATAR_EQUIP_LOCAL_KEY) : null
        if (data.isGuest) {
          setEquippedAvatarKey(ls || data.equippedAvatarKey || DEMO_FALLBACK_AVATAR_KEY)
        } else {
          // 로그인 유저: 서버가 명시적 선택값이 있으면 사용, 없으면(기본) 데모 기본값.
          const serverKey = data.equippedAvatarKey
          const hasExplicitSelection = !!serverKey && serverKey !== DEFAULT_AVATAR_KEY
          setEquippedAvatarKey(hasExplicitSelection ? serverKey : DEMO_FALLBACK_AVATAR_KEY)
        }
      } catch {
        // 조용히 데모 기본값 유지
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsub = sceneBridge.on("user:report", (payload) => {
      if (payload) setReportTarget({ userId: payload.userId, nickname: payload.nickname })
    })
    return () => unsub()
  }, [])

  // 간단 데모 identity — Clerk 우회 (demo 라우트 전용). 같은 브라우저 탭 재접속
  // 시 매번 새 userId 생성 → 서로 다른 유저로 보임. 추후 Clerk 연동.
  const identity = useMemo<MetaversePlayerIdentity>(() => {
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    return {
      userId: `demo-${rand}`,
      nickname: `데모-${rand}`,
      avatarKey: equippedAvatarKey,
    }
  }, [equippedAvatarKey])

  useEffect(() => {
    if (!parentRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const [{ bootSideScrollerDemo }, { SideScrollerChannel }] = await Promise.all([
          import("@/lib/metaverse/boot"),
          import("@/lib/metaverse/realtime/sidescroll-channel"),
        ])
        if (cancelled) return

        // Realtime 채널 — 실패해도 게임은 부팅 (싱글플레이 fallback)
        const supabase = createAnonClient()
        const channel = new SideScrollerChannel(supabase, identity)
        try {
          await channel.connect()
          channelRef.current = channel
        } catch (err) {
          console.warn("[sidescroll] realtime connect failed — singleplayer mode", err)
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
        console.error("[metaverse] side-scroller boot failed", err)
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
    // 상점에서 장착 성공 → state 갱신 시 identity memo 재계산 → 씬 useEffect 가 cleanup + 재부팅
    setEquippedAvatarKey(avatarKey)
  }, [])

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
    // 헤더 만큼 뺀 viewport 높이 + 서비스 콘텐츠 폭 (max-w-[1280px]) 에 중앙 정렬.
    // 좌우 여백에 scene backgroundColor 가 보이지 않도록 폭 제한.
    <div className="relative mx-auto h-[calc(100svh-3.5rem)] w-full max-w-[1280px] bg-neutral-950">
      <div ref={parentRef} className="h-full w-full" aria-label="사이드스크롤러 프로토타입" />
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <button
          onClick={() => setShopOpen(true)}
          className="rounded bg-black/60 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur-sm transition-colors hover:text-white"
        >
          👕 유니폼 상점
        </button>
        <Link
          href="/metaverse/uk"
          className="rounded bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-sm transition-colors hover:text-white"
        >
          ← 월드맵으로
        </Link>
      </div>
      <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/60">
        Phase 4 프로토타입 · 단독 씬
      </div>
      {/* 채팅 — 데모 모드는 로컬 bubble 만. Enter 로 입력 → 내 머리 위 말풍선 5초 */}
      <ChatOverlay canSend={true} />
      {/* 채팅 로그 — 혼자 보낸 것도 기록 (데모에선 리모트 없음) */}
      <ChatLogPanel identity={identity} />
      {/* 닉네임 클릭 시 뮤트/신고 팝오버 — 데모에선 본인만 있어서 발동 X, 일관성 위해 마운트 */}
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
      />
    </div>
  )
}
