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
import type { ChatRoomMeta, MetaversePlayerIdentity, WorldPlot } from "@/lib/metaverse/types"
import type { WorldChannel } from "@/lib/metaverse/realtime/world-channel"
import type { RoomChannel } from "@/lib/metaverse/realtime/room-channel"
import { ChatOverlay } from "./chat-overlay"
import { ActivityBalanceHud, refreshActivityBalance } from "./activity-balance-hud"
import { PlotActionOverlay } from "./plot-action-overlay"
import { CreateRoomModal, type CreateRoomContext } from "./create-room-modal"
import { RoomDetailModal, type RoomDetailContext } from "./room-detail-modal"
import { OnboardingHint } from "./onboarding-hint"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { trackEvent } from "@/lib/analytics/events"

export function PhaserCanvas({ identity }: { identity: MetaversePlayerIdentity }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const channelRef = useRef<WorldChannel | null>(null)
  const roomChannelRef = useRef<RoomChannel | null>(null)
  const [channel, setChannel] = useState<WorldChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready">("loading")
  const [createRoomCtx, setCreateRoomCtx] = useState<CreateRoomContext | null>(null)
  const [roomDetailCtx, setRoomDetailCtx] = useState<RoomDetailContext | null>(null)
  const [roomOccupantCount, setRoomOccupantCount] = useState(0)

  // 방 접속자 수 추적 — RoomDetailModal 및 향후 HUD 확장 공용
  useEffect(() => {
    const unsub = sceneBridge.on("room:presence", (payload) => {
      if (payload) setRoomOccupantCount(payload.count)
    })
    const unsubLeave = sceneBridge.on("plot:leave", () => setRoomOccupantCount(0))
    return () => {
      unsub()
      unsubLeave()
    }
  }, [])

  useEffect(() => {
    if (!parentRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        // 1) 병렬: Phaser/Channel 모듈 로드 + Plot/Room 초기 데이터 fetch
        const [{ WorldChannel }, { bootMetaverseGame }, plotsRes] = await Promise.all([
          import("@/lib/metaverse/realtime/world-channel"),
          import("@/lib/metaverse/boot"),
          fetch("/api/metaverse/plots").then((r) => (r.ok ? r.json() : null)),
        ])
        if (cancelled) return

        const plots: WorldPlot[] = plotsRes?.plots ?? []
        const rooms: ChatRoomMeta[] = plotsRes?.rooms ?? []

        // 2) Realtime 월드 채널 연결
        const supabase = createAnonClient()
        const newChannel = new WorldChannel(supabase, identity)
        try {
          await newChannel.connect()
        } catch (err) {
          // Realtime 실패해도 싱글플레이어로는 동작 가능 — 경고만 남기고 진행
          console.warn("[metaverse] realtime connect failed (offline mode)", err)
        }
        if (cancelled) {
          await newChannel.disconnect().catch(() => {})
          return
        }
        channelRef.current = newChannel
        setChannel(newChannel)
        trackEvent({
          name: "metaverse_enter",
          params: { is_guest: identity.userId.startsWith("guest-") },
        })

        // 3) Phaser 게임 부팅 — 채널 + plot/room 초기 데이터 주입
        if (!parentRef.current) return
        gameRef.current = bootMetaverseGame({
          parent: parentRef.current,
          identity,
          channel: newChannel,
          plots,
          rooms,
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
      roomChannelRef.current?.disconnect().catch(() => {})
      roomChannelRef.current = null
    }
  }, [identity])

  // Plot 진입/이탈에 따라 방 채널 자동 연결/해제.
  // 씬은 sceneBridge room:channel:attach/detach 이벤트로 상태 동기화.
  useEffect(() => {
    let cancelled = false

    const detachIfAny = async () => {
      const prev = roomChannelRef.current
      if (prev) {
        roomChannelRef.current = null
        sceneBridge.emit("room:channel:detach")
        await prev.disconnect().catch(() => {})
      }
    }

    const unsubEnter = sceneBridge.on("plot:enter", (detail) => {
      if (!detail) return
      trackEvent({
        name: "metaverse_plot_enter",
        params: { plot_code: detail.plotCode, has_room: !!detail.roomId },
      })
      if (!detail.roomId) {
        void detachIfAny()
        return
      }
      // 이미 동일 room에 연결되어있으면 스킵
      if (roomChannelRef.current?.roomId === detail.roomId) return

      void (async () => {
        await detachIfAny()
        if (cancelled) return
        try {
          const { RoomChannel } = await import("@/lib/metaverse/realtime/room-channel")
          const supabase = createAnonClient()
          const rc = new RoomChannel(supabase, identity, detail.roomId!)
          // presence count → React UI 로 전파
          rc.onPresenceChange((count) => {
            sceneBridge.emit("room:presence", { count })
          })
          await rc.connect()
          if (cancelled) {
            await rc.disconnect().catch(() => {})
            return
          }
          roomChannelRef.current = rc
          sceneBridge.emit("room:channel:attach", { channel: rc })
        } catch (err) {
          console.warn("[metaverse] room channel connect failed", err)
        }
      })()
    })

    const unsubLeave = sceneBridge.on("plot:leave", () => {
      void detachIfAny()
    })

    return () => {
      cancelled = true
      unsubEnter()
      unsubLeave()
      void detachIfAny()
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
      {/* 우상단 활동 포인트 HUD */}
      <ActivityBalanceHud identity={identity} />
      {/* Plot 진입 시 컨텍스트 버튼 */}
      <PlotActionOverlay
        identity={identity}
        onCreateRoom={(ctx) =>
          setCreateRoomCtx({
            plotId: ctx.plotId,
            plotCode: ctx.plotCode,
            plazaName: ctx.plazaName,
          })
        }
        onEnterRoom={(ctx) => {
          if (!ctx.roomId || !ctx.ownerUserId) return
          setRoomDetailCtx({
            roomId: ctx.roomId,
            plotId: ctx.plotId,
            plotCode: ctx.plotCode,
            plazaName: ctx.plazaName,
            ownerUserId: ctx.ownerUserId,
          })
        }}
      />
      {/* 방 개설 모달 */}
      <CreateRoomModal
        context={createRoomCtx}
        identity={identity}
        onClose={() => setCreateRoomCtx(null)}
        onCreated={(room) => {
          sceneBridge.emit("room:created", room)
          refreshActivityBalance()
          setCreateRoomCtx(null)
        }}
      />
      {/* 방 상세 모달 */}
      <RoomDetailModal
        context={roomDetailCtx}
        identity={identity}
        occupantCount={roomOccupantCount}
        onClose={() => setRoomDetailCtx(null)}
      />
      {/* 하단 채팅 오버레이 — 씬이 world/room 채널 라우팅 */}
      <ChatOverlay canSend={!!channel} />
      {/* 최초 진입 안내 (1회) */}
      {status === "ready" && <OnboardingHint />}
    </div>
  )
}
