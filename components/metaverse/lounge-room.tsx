"use client"

/**
 * LoungeRoom — 팬 라운지 (정식 멀티유저 채팅방).
 *
 * SideScrollerDemo(데모 게스트 전용)의 정식 버전:
 *  - Clerk 로그인 유저만 입장 — 실제 닉네임(profiles) + 실제 userId 로 presence
 *  - 입장 시 본인 "장착 아바타"(/api/metaverse/avatar/me equipped) 로 스폰 —
 *    유니폼 상점에서 갈아입으면 즉시 반영 (씬 재부팅)
 *  - 방 샤딩: 방당 정원(LOUNGE_ROOM_CAPACITY)명. 입장 시 1번 방부터 presence 를
 *    프로브해 자리가 있는 첫 방에 배정, 정원 초과면 다음 방.
 *  - 개설 가능한 방 수 = 아스날 경기장 레벨 (/api/lounge/config) — 모든 방이
 *    만석이면 "경기장 레벨을 올리면 방이 늘어나요" 안내 → 기부 루프 당위성.
 *  - 채널 'metaverse:lounge:room-N' — 'metaverse:%' RLS 정책이 프로덕션 적용됨.
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
  // 방 구성 (경기장 레벨 연동) — 로드 실패 시 최소 구성으로 폴백
  const [loungeConfig, setLoungeConfig] = useState<{
    stadiumLevel: number
    channelCap: number
    capacityPerChannel: number
  } | null>(null)
  const [roomIndex, setRoomIndex] = useState<number | null>(null)
  const [allFull, setAllFull] = useState(false)
  const [joinAttempt, setJoinAttempt] = useState(0)
  // 방 이동: 유저가 고른 방 (null = 자동 배정). 만석이면 자동 배정으로 폴백 + 안내.
  const [desiredRoom, setDesiredRoom] = useState<number | null>(null)
  // 현재 방 실시간 인원 (나 포함) — 연결된 채널 presence 에서 갱신
  const [currentOccupancy, setCurrentOccupancy] = useState<number | null>(null)
  const [switchMsg, setSwitchMsg] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  // 방별 인원 스냅샷 (패널 열 때 프로브). -1 = 확인 실패
  const [roomCounts, setRoomCounts] = useState<Record<number, number> | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  // 입장 준비: 프로필 닉네임 + 장착 아바타를 병렬 로드
  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    ;(async () => {
      const [profileRes, avatarRes, configRes] = await Promise.all([
        fetch("/api/profile/me", { cache: "no-store" }).catch(() => null),
        fetch("/api/metaverse/avatar/me", { cache: "no-store" }).catch(() => null),
        fetch("/api/lounge/config").catch(() => null),
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
      let config = {
        stadiumLevel: 1,
        channelCap: 1,
        capacityPerChannel: METAVERSE.LOUNGE_ROOM_CAPACITY as number,
      }
      if (configRes?.ok) {
        const data = await configRes.json()
        config = {
          stadiumLevel: Number(data?.stadiumLevel) || 1,
          channelCap: Math.max(1, Number(data?.channelCap) || 1),
          capacityPerChannel: Number(data?.capacityPerChannel) || METAVERSE.LOUNGE_ROOM_CAPACITY,
        }
      }
      if (cancelled) return
      setProfileNickname(nickname)
      setEquippedAvatarKey(avatarKey)
      setLoungeConfig(config)
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
    if (!identity || !loungeConfig || !parentRef.current) return
    let cancelled = false
    setAllFull(false)
    setRoomIndex(null)
    ;(async () => {
      try {
        const [{ bootSideScrollerDemo }, { SideScrollerChannel, probeChannelOccupancy }] =
          await Promise.all([
            import("@/lib/metaverse/boot"),
            import("@/lib/metaverse/realtime/sidescroll-channel"),
          ])
        if (cancelled) return

        const supabase = createAnonClient()

        // ---- 방 배정 ----
        // 1) 유저가 방을 직접 골랐으면(desiredRoom) 그 방 우선 — 만석이면 안내 후 자동 배정
        // 2) 자동: 1번 방부터 자리가 있는 첫 방
        // 프로브 실패(realtime 다운)면 그냥 진행 → connect 도 실패하면 싱글플레이 fallback.
        let assigned = -1
        let realtimeDown = false
        if (desiredRoom && desiredRoom >= 1 && desiredRoom <= loungeConfig.channelCap) {
          try {
            const occupancy = await probeChannelOccupancy(
              supabase,
              `${METAVERSE.CHANNEL_LOUNGE_PREFIX}${desiredRoom}`
            )
            if (occupancy < loungeConfig.capacityPerChannel) assigned = desiredRoom
            else setSwitchMsg(`${desiredRoom}번 방이 가득 찼어요 — 자리가 있는 방으로 배정할게요`)
          } catch (err) {
            console.warn("[lounge] occupancy probe failed", err)
            realtimeDown = true
            assigned = desiredRoom
          }
          if (cancelled) return
        }
        if (assigned < 0) {
          for (let i = 1; i <= loungeConfig.channelCap; i++) {
            let occupancy = 0
            try {
              occupancy = await probeChannelOccupancy(
                supabase,
                `${METAVERSE.CHANNEL_LOUNGE_PREFIX}${i}`
              )
            } catch (err) {
              console.warn("[lounge] occupancy probe failed", err)
              realtimeDown = true
            }
            if (cancelled) return
            if (realtimeDown || occupancy < loungeConfig.capacityPerChannel) {
              assigned = i
              break
            }
          }
        }
        if (assigned < 0) {
          // 모든 방 만석 — 경기장 레벨업 당위성 안내
          if (!cancelled) setAllFull(true)
          return
        }

        // Realtime 채널 — 실패해도 방은 부팅 (싱글플레이 fallback)
        const channel = new SideScrollerChannel(
          supabase,
          identity,
          `${METAVERSE.CHANNEL_LOUNGE_PREFIX}${assigned}`
        )
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
        setRoomIndex(assigned)
        // 현재 방 실시간 인원: presence remote(나 제외) + 1
        if (channelRef.current) {
          setCurrentOccupancy(1)
          channelRef.current.onRemoteChange((remote) => {
            setCurrentOccupancy(remote.size + 1)
          })
        } else {
          setCurrentOccupancy(null)
        }
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
      setCurrentOccupancy(null)
    }
  }, [identity, loungeConfig, joinAttempt, desiredRoom])

  const handleEquipped = useCallback((avatarKey: string) => {
    // 상점 장착 성공 → identity memo 재계산 → 씬 재부팅으로 즉시 반영
    setEquippedAvatarKey(avatarKey)
  }, [])

  // 방 이동 안내 토스트 자동 소멸
  useEffect(() => {
    if (!switchMsg) return
    const t = setTimeout(() => setSwitchMsg(null), 4000)
    return () => clearTimeout(t)
  }, [switchMsg])

  // 방 목록 인원 스냅샷 — 패널 열 때 + 새로고침 버튼에서 호출 (병렬 프로브)
  const refreshRoomCounts = useCallback(async () => {
    if (!loungeConfig) return
    setCountsLoading(true)
    try {
      const { probeChannelOccupancy } = await import("@/lib/metaverse/realtime/sidescroll-channel")
      const supabase = createAnonClient()
      const entries = await Promise.all(
        Array.from({ length: loungeConfig.channelCap }, (_, k) => k + 1).map(async (i) => {
          try {
            return [
              i,
              await probeChannelOccupancy(supabase, `${METAVERSE.CHANNEL_LOUNGE_PREFIX}${i}`),
            ] as const
          } catch {
            return [i, -1] as const
          }
        })
      )
      setRoomCounts(Object.fromEntries(entries))
    } finally {
      setCountsLoading(false)
    }
  }, [loungeConfig])

  const toggleSwitcher = useCallback(() => {
    setSwitcherOpen((open) => {
      if (!open) void refreshRoomCounts()
      return !open
    })
  }, [refreshRoomCounts])

  const handlePickRoom = useCallback(
    (i: number) => {
      setSwitcherOpen(false)
      if (i === roomIndex) return
      setSwitchMsg(`${i}번 방으로 이동 중…`)
      setDesiredRoom(i)
      // 같은 desiredRoom 을 다시 고른 경우(직전 이동이 만석 폴백된 뒤 재시도)에도
      // 부팅 이펙트가 재실행되도록 attempt 를 함께 올린다 (같은 배치라 재부팅은 1회).
      setJoinAttempt((n) => n + 1)
    },
    [roomIndex]
  )

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

  if (allFull && loungeConfig) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-2xl">🈵</p>
          <h1 className="mt-3 text-lg font-bold">라운지가 가득 찼어요</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            지금 열려 있는 방 {loungeConfig.channelCap}개(방당 {loungeConfig.capacityPerChannel}
            명)가 모두 만석이에요.
            <br />방 개수는 <b className="text-white/85">아스날 경기장 레벨</b>(현재 Lv.
            {loungeConfig.stadiumLevel})만큼 열려요 — 경기장에 기부해서 레벨을 올리면 새 방이
            생겨요!
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => setJoinAttempt((n) => n + 1)}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
            >
              다시 시도
            </button>
            <Link
              href="/stadium"
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
            >
              경기장 키우러 가기
            </Link>
          </div>
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
        locationLabel={
          roomIndex
            ? `🛋️ 팬 라운지 · ${roomIndex}번 방${
                currentOccupancy && loungeConfig
                  ? ` (${currentOccupancy}/${loungeConfig.capacityPerChannel})`
                  : ""
              }`
            : "🛋️ 팬 라운지"
        }
        actions={
          <>
            <button
              onClick={toggleSwitcher}
              className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-black/80"
            >
              🚪 방 목록
            </button>
            <button
              onClick={() => setShopOpen(true)}
              className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-black/80"
            >
              👕 유니폼 상점
            </button>
          </>
        }
      />
      {/* 방 이동 안내 토스트 */}
      {switchMsg && (
        <div className="absolute top-16 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/12 bg-black/80 px-4 py-2 text-xs font-semibold text-white/90 shadow-lg backdrop-blur-sm">
          {switchMsg}
        </div>
      )}
      {/* 방 목록 패널 — 방별 인원 + 클릭 이동 */}
      {switcherOpen && loungeConfig && (
        <div className="absolute top-14 right-3 z-30 w-60 rounded-xl border border-white/12 bg-black/85 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-white/90">방 목록</span>
            <button
              onClick={() => void refreshRoomCounts()}
              disabled={countsLoading}
              className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {countsLoading ? "확인 중…" : "새로고침"}
            </button>
          </div>
          <div className="space-y-1">
            {Array.from({ length: loungeConfig.channelCap }, (_, k) => k + 1).map((i) => {
              const isCurrent = i === roomIndex
              const cnt = isCurrent ? currentOccupancy : roomCounts?.[i]
              const isFull =
                typeof cnt === "number" && cnt >= 0 && cnt >= loungeConfig.capacityPerChannel
              return (
                <button
                  key={i}
                  onClick={() => handlePickRoom(i)}
                  disabled={isCurrent || isFull}
                  className={
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors " +
                    (isCurrent
                      ? "bg-white/15 text-white"
                      : isFull
                        ? "cursor-not-allowed text-white/35"
                        : "text-white/80 hover:bg-white/10")
                  }
                >
                  <span>
                    {i}번 방
                    {isCurrent && (
                      <span className="ml-1.5 rounded bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                        현재
                      </span>
                    )}
                    {!isCurrent && isFull && (
                      <span className="ml-1.5 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                        만석
                      </span>
                    )}
                  </span>
                  <span className="text-white/60 tabular-nums">
                    {cnt == null || cnt < 0 ? "–" : `${cnt}/${loungeConfig.capacityPerChannel}`}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-white/45">
            방 개수는 아스날 경기장 레벨(Lv.{loungeConfig.stadiumLevel})만큼 열려요
          </p>
        </div>
      )}
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
