"use client"

/**
 * SideScrollerDemo — 사이드스크롤러 멀티플레이어 씬.
 *
 * Realtime SideScrollerChannel 연결해 원격 유저·공유 공·박치기 이벤트 동기화.
 * Realtime 실패 시 싱글플레이 fallback. Clerk 로그인 있으면 본인 닉네임,
 * 없으면 `demo-XXXX` 게스트.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createAnonClient } from "@/lib/supabase/client"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import type { SideScrollerChannel } from "@/lib/metaverse/realtime/sidescroll-channel"
import { ChatOverlay } from "./chat-overlay"
import { ChatLogPanel } from "./chat-log-panel"
import { UserActionPopover } from "./user-action-popover"
import { ReportUserDialog, type ReportTarget } from "./report-user-dialog"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

export function SideScrollerDemo() {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const channelRef = useRef<SideScrollerChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)

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
    return { userId: `demo-${rand}`, nickname: `데모-${rand}` }
  }, [])

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
      <Link
        href="/metaverse"
        className="absolute top-2 right-2 rounded bg-black/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-sm transition-colors hover:text-white"
      >
        ← 월드맵으로
      </Link>
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
    </div>
  )
}
