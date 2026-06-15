"use client"

/**
 * HighburyStage — 하이버리 외관 + 클럭 엔드 내부 사이드뷰 메타버스.
 *
 * 같은 씬 인스턴스가 mapId 만 바꾸며 재시작 → 부드러운 페이드 전환.
 * 도어 위로 가서 ↑ / W 누르면 다음 맵으로 이동.
 *
 * 인증: 비로그인 차단 — `useAuth.isSignedIn` false 시 /sign-in 리다이렉트.
 * 채팅: 자기 메시지 echo (멀티 채널은 다음 단계에서 SideScrollerChannel 패턴 차용).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import { MALE_BASIC_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { MetaverseHud } from "./metaverse-hud"
import { ChatOverlay } from "./chat-overlay"
import { ChatLogPanel } from "./chat-log-panel"
import { UserActionPopover } from "./user-action-popover"
import { ReportUserDialog, type ReportTarget } from "./report-user-dialog"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { RoomChannel } from "@/lib/metaverse/realtime/room-channel"
import { IndoorPresenceChannel } from "@/lib/metaverse/realtime/indoor-presence-channel"
import { METAVERSE } from "@/lib/metaverse/constants"
import { createAnonClient } from "@/lib/supabase/client"

interface HighburyStageProps {
  /** true 면 비로그인 게스트도 진입 가능 (테스트용 — /metaverse/gandalf 등). 기본 false. */
  allowGuest?: boolean
}

export function HighburyStage({ allowGuest = false }: HighburyStageProps = {}) {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  /** Supabase profiles.nickname — Clerk username 보다 우선 (사이트 실제 닉네임). */
  const [profileNickname, setProfileNickname] = useState<string | null>(null)

  // 사이트 닉네임 로드 — /api/profile/me 의 nickname 우선 사용.
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    fetch("/api/profile/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const nick = data?.profile?.nickname || data?.nickname
        if (typeof nick === "string" && nick.trim()) setProfileNickname(nick)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  // 비로그인 차단 — 사이트는 /sign-in 라우트가 아니라 GNB inline SignInButton 사용.
  // 비로그인 시 메시지만 표시 + 홈 버튼.
  void router

  // 게스트 모드용 안정적 userId — useMemo 첫 호출 시 1번 생성 후 유지.
  const guestIdentityRef = useRef<MetaversePlayerIdentity | null>(null)
  if (allowGuest && !guestIdentityRef.current && typeof window !== "undefined") {
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    guestIdentityRef.current = {
      userId: `guest-gandalf-${rand}`,
      nickname: `방문객-${rand}`,
      avatarKey: MALE_BASIC_AVATAR_KEY,
    }
  }

  // identity — Supabase profiles.nickname 우선 → Clerk username/firstName fallback.
  // allowGuest=true & 비로그인 시 게스트 identity 사용.
  const identity = useMemo<MetaversePlayerIdentity | null>(() => {
    if (!user) {
      // 비로그인 + 게스트 모드 허용 → 미리 생성된 게스트 identity 반환
      if (allowGuest && guestIdentityRef.current) return guestIdentityRef.current
      return null
    }
    if (!profileNickname) {
      const fallback = user.username || user.firstName || user.fullName
      if (!fallback) return null
      return { userId: user.id, nickname: fallback, avatarKey: MALE_BASIC_AVATAR_KEY }
    }
    return {
      userId: user.id,
      nickname: profileNickname,
      avatarKey: MALE_BASIC_AVATAR_KEY,
    }
  }, [user, profileNickname, allowGuest])

  // user:report 이벤트 listen — UserActionPopover 의 신고 버튼 → ReportUserDialog open
  useEffect(() => {
    const unsub = sceneBridge.on("user:report", (payload) => {
      if (payload) setReportTarget({ userId: payload.userId, nickname: payload.nickname })
    })
    return () => unsub()
  }, [])

  // 멀티플레이 채팅 채널 — roomId "highbury" 글로벌 방. presence(접속자 수) + chat broadcast.
  // 채널이 self-dispatch 까지 처리하므로 chat:log:append 는 onChatMessage 한 곳에서만 emit.
  useEffect(() => {
    if (!identity) return
    let cancelled = false
    let channel: RoomChannel | null = null
    const supabase = createAnonClient()
    const newChannel = new RoomChannel(supabase, identity, "highbury")

    const unsubSend = sceneBridge.on("chat:send", ({ text }) => {
      channel?.publishChat(text)
    })

    newChannel
      .connect()
      .then(() => {
        if (cancelled) {
          void newChannel.disconnect()
          return
        }
        channel = newChannel
        newChannel.onChatMessage((msg) => {
          sceneBridge.emit("chat:log:append", {
            userId: msg.userId,
            nickname: msg.nickname,
            text: msg.text,
            timestamp: msg.timestamp,
            scope: "room",
          })
        })
      })
      .catch((err) => {
        console.warn("[highbury] room channel connect failed — chat broadcast 비활성", err)
        // fallback: 자기 메시지만이라도 panel 에 표시하도록 chat:send echo
        sceneBridge.on("chat:send", ({ text }) => {
          sceneBridge.emit("chat:log:append", {
            userId: identity.userId,
            nickname: identity.nickname,
            text,
            timestamp: Date.now(),
            scope: "local",
          })
        })
      })

    return () => {
      cancelled = true
      unsubSend()
      if (channel) void channel.disconnect()
    }
  }, [identity])

  useEffect(() => {
    if (!parentRef.current || !identity) return
    let cancelled = false
    let presenceChannel: IndoorPresenceChannel | null = null
    ;(async () => {
      try {
        // presence 채널 — 다른 사용자 위치/액션 sync. 실패해도 싱글플레이로 부팅.
        const supabase = createAnonClient()
        const newPresence = new IndoorPresenceChannel(
          supabase,
          identity,
          METAVERSE.CHANNEL_INDOOR_HIGHBURY
        )
        try {
          await newPresence.connect()
          presenceChannel = newPresence
        } catch (err) {
          console.warn("[highbury] presence connect failed — 싱글플레이 mode", err)
          presenceChannel = null
        }
        if (cancelled) {
          void presenceChannel?.disconnect()
          return
        }

        const { bootIndoorMap } = await import("@/lib/metaverse/boot")
        if (cancelled || !parentRef.current) return
        gameRef.current = bootIndoorMap({
          parent: parentRef.current,
          identity,
          mapId: "highbury",
          channel: presenceChannel,
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
      void presenceChannel?.disconnect()
    }
  }, [identity])

  // 페이지 진입 동안 body 스크롤 잠금 — GNB 외 다른 영역 스크롤바 제거.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [])

  // 로딩 상태 — Phaser 부팅 안 함 (게스트 모드면 Clerk 결과 기다리지 않음)
  if (!isLoaded && !allowGuest) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 text-white">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          로그인 확인 중…
        </div>
      </div>
    )
  }

  // 비로그인 — 안내 + 홈 버튼 (사이트는 /sign-in 라우트 없이 GNB SignInButton 사용)
  // allowGuest=true 면 비로그인이어도 게스트로 진입 가능 → 차단 X.
  if (!isSignedIn && !allowGuest) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-white">
        <div className="space-y-2">
          <p className="text-base font-semibold">로그인이 필요해요</p>
          <p className="text-xs text-white/60">메타버스에 입장하려면 먼저 로그인해주세요.</p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.03] hover:bg-white/15"
        >
          홈으로 가기
        </Link>
      </div>
    )
  }

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

  // identity 가 일시적으로 null 일 수 있음 (isSignedIn=true 인데 user 객체 늦게 도착)
  if (!identity) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-x-0 mx-auto max-w-[1280px] overflow-hidden bg-neutral-950"
      style={{ top: "3.5rem", bottom: 0 }}
    >
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
        A/D · ←→ 이동 · Space 점프 · 도어 앞에서 W/↑ 진입 · Enter 채팅
      </div>
      {/* 채팅 — 로컬 echo (혼자 보낸 메시지만 패널에 누적) */}
      <ChatOverlay canSend={true} />
      <ChatLogPanel identity={identity} />
      {/* 다른 유저 클릭 시 뮤트/신고 팝오버 — 현재는 single-player 라 발동 X, 멀티 채널 추가 시 작동 */}
      <UserActionPopover identity={identity} />
      <ReportUserDialog
        target={reportTarget}
        identity={identity}
        onClose={() => setReportTarget(null)}
      />
    </div>
  )
}
