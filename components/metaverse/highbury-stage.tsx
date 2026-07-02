"use client"

/**
 * HighburyStage — 하이버리 외관 + 클럭 엔드 내부 사이드뷰 메타버스.
 *
 * 같은 씬 인스턴스가 mapId 만 바꾸며 재시작 → 부드러운 페이드 전환.
 * 도어 위로 가서 ↑ / W 누르면 다음 맵으로 이동.
 *
 * 방 샤딩 (2026-07-02, 라운지에서 이식):
 *  - 방당 정원 10명. 입장 시 room-1 부터 presence 프로브해 자리 있는 첫 방 배정.
 *  - 개설 가능한 방 수 = 아스날 경기장 레벨 (/api/lounge/config) — 전부 만석이면
 *    "경기장 레벨을 올리면 방이 늘어나요" 안내 (기부 루프 당위성).
 *  - presence 채널 metaverse:indoor:highbury:room-N / 채팅 roomId highbury-N.
 *  - 방 목록 패널에서 방별 인원 확인 + 클릭 이동.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"
import { MALE_BASIC_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { MetaverseHud } from "./metaverse-hud"
import { TouchControls } from "./touch-controls"
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
  /** true 면 비로그인 게스트도 진입 가능 (테스트용 — /metaverse/prototype 등). 기본 false. */
  allowGuest?: boolean
  /**
   * PIP(전역 상주) 모드 — StadiumPipProvider(GlobalStadium)가 넘김.
   * 있으면 컨테이너 포지셔닝은 부모(wrapper)가 담당하고, mini 일 땐 오버레이 UI 를
   * 전부 숨기고 씬 키보드를 차단한다. 없으면(standalone, /metaverse/prototype 등)
   * 기존처럼 스스로 헤더 아래 풀스크린 fixed 로 렌더.
   */
  pip?: { mode: "full" | "mini"; onExpand: () => void; onClose: () => void }
}

export function HighburyStage({ allowGuest = false, pip }: HighburyStageProps = {}) {
  const isMini = pip?.mode === "mini"
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  // SSR 은 identity=null(게스트 ref 가 window 필요)이라 로딩 분기를 렌더하는데, 클라 첫
  // 렌더는 identity 가 있어 본 화면을 그리면서 hydration mismatch 발생 → mounted 게이트.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // 헤더 실측 높이 — GNB 가 헤더 아래 별도 행이라 총 높이가 3.5rem(56px)보다 큼(~94px).
  // 고정 3.5rem 을 쓰면 스테이지 상단(HUD 버튼)이 GNB 행에 가려져 클릭 불가.
  const [topOffset, setTopOffset] = useState(56)
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector("header")
      if (h) setTopOffset(Math.ceil(h.getBoundingClientRect().bottom))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  const parentRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean) => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  /** Supabase profiles.nickname — Clerk username 보다 우선 (사이트 실제 닉네임). */
  const [profileNickname, setProfileNickname] = useState<string | null>(null)

  // ---- 방 샤딩 상태 (라운지에서 이식) ----
  const [stadiumConfig, setStadiumConfig] = useState<{
    stadiumLevel: number
    channelCap: number
    capacityPerChannel: number
  } | null>(null)
  const [roomIndex, setRoomIndex] = useState<number | null>(null)
  const [allFull, setAllFull] = useState(false)
  const [joinAttempt, setJoinAttempt] = useState(0)
  const [desiredRoom, setDesiredRoom] = useState<number | null>(null)
  const [currentOccupancy, setCurrentOccupancy] = useState<number | null>(null)
  const [switchMsg, setSwitchMsg] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [roomCounts, setRoomCounts] = useState<Record<number, number> | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  // 방 구성 로드 — 게스트 포함 전원 (공개 API). 실패 시 최소 구성 폴백.
  useEffect(() => {
    let cancelled = false
    fetch("/api/lounge/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        setStadiumConfig({
          stadiumLevel: Number(data?.stadiumLevel) || 1,
          channelCap: Math.max(1, Number(data?.channelCap) || 1),
          capacityPerChannel: Number(data?.capacityPerChannel) || METAVERSE.LOUNGE_ROOM_CAPACITY,
        })
      })
      .catch(() => {
        if (!cancelled)
          setStadiumConfig({
            stadiumLevel: 1,
            channelCap: 1,
            capacityPerChannel: METAVERSE.LOUNGE_ROOM_CAPACITY,
          })
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  // 멀티플레이 채팅 채널 — 배정된 방(roomIndex)별 분리 (highbury-1, highbury-2 …).
  // 채널이 self-dispatch 까지 처리하므로 chat:log:append 는 onChatMessage 한 곳에서만 emit.
  useEffect(() => {
    if (!identity || roomIndex === null) return
    let cancelled = false
    let channel: RoomChannel | null = null
    const supabase = createAnonClient()
    const newChannel = new RoomChannel(supabase, identity, `highbury-${roomIndex}`)

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
  }, [identity, roomIndex])

  useEffect(() => {
    if (!parentRef.current || !identity || !stadiumConfig) return
    let cancelled = false
    let presenceChannel: IndoorPresenceChannel | null = null
    setAllFull(false)
    setRoomIndex(null)
    ;(async () => {
      try {
        // createAnonClient 는 브라우저 싱글턴 (다중 인스턴스 = realtime 동시성 문제).
        // 별도 프로브 채널을 열었다 닫으면 소켓이 내려가며 본 presence 구독과 경합하므로,
        // 정원 검사는 "presence 채널 자체"로 한다: track 없이 구독 → 인원 확인 →
        // 자리 있으면 trackSelf(정식 입장), 만석이면 disconnect 후 다음 방.
        const supabase = createAnonClient()
        const roomChannelName = (i: number) => `${METAVERSE.CHANNEL_INDOOR_HIGHBURY}:room-${i}`

        let assigned = -1
        let realtimeDown = false
        type EnterResult =
          | { status: "entered"; ch: IndoorPresenceChannel }
          | { status: "full" | "down"; ch: null }
        const tryEnterRoom = async (i: number): Promise<EnterResult> => {
          const ch = new IndoorPresenceChannel(supabase, identity, roomChannelName(i))
          try {
            await ch.connect({ track: false })
          } catch (err) {
            console.warn(`[highbury] room-${i} presence connect failed`, err)
            await ch.disconnect().catch(() => {})
            return { status: "down", ch: null }
          }
          await ch.waitFirstSync()
          const occupancy = ch.getOccupancy()
          if (occupancy >= stadiumConfig.capacityPerChannel) {
            await ch.disconnect().catch(() => {})
            return { status: "full", ch: null }
          }
          await ch.trackSelf()
          return { status: "entered", ch }
        }

        // 1) 직접 고른 방(desiredRoom) 우선 — 만석이면 안내 후 자동 배정
        if (desiredRoom && desiredRoom >= 1 && desiredRoom <= stadiumConfig.channelCap) {
          const r = await tryEnterRoom(desiredRoom)
          if (cancelled) {
            void r.ch?.disconnect()
            return
          }
          if (r.status === "entered") {
            presenceChannel = r.ch
            assigned = desiredRoom
          } else if (r.status === "full") {
            setSwitchMsg(`${desiredRoom}번 방이 가득 찼어요 — 자리가 있는 방으로 배정할게요`)
          } else {
            realtimeDown = true
            assigned = desiredRoom // realtime 다운 → 싱글플레이로 그 방 부팅
          }
        }
        // 2) 자동: 1번 방부터 자리가 있는 첫 방
        if (assigned < 0 && !realtimeDown) {
          for (let i = 1; i <= stadiumConfig.channelCap; i++) {
            const r = await tryEnterRoom(i)
            if (cancelled) {
              void r.ch?.disconnect()
              return
            }
            if (r.status === "entered") {
              presenceChannel = r.ch
              assigned = i
              break
            }
            if (r.status === "down") {
              realtimeDown = true
              assigned = i // 싱글플레이 폴백
              break
            }
          }
        }
        if (assigned < 0) {
          if (!cancelled) setAllFull(true)
          return
        }
        if (realtimeDown) console.warn("[highbury] presence unavailable — 싱글플레이 mode")

        const { bootIndoorMap } = await import("@/lib/metaverse/boot")
        if (cancelled || !parentRef.current) return
        setRoomIndex(assigned)
        // 현재 방 실시간 인원 = 원격(나 제외) + 1
        const activeChannel = presenceChannel
        if (activeChannel) {
          setCurrentOccupancy(1)
          activeChannel.onRemoteChange((remote) => setCurrentOccupancy(remote.size + 1))
        } else {
          setCurrentOccupancy(null)
        }
        gameRef.current = bootIndoorMap({
          parent: parentRef.current,
          identity,
          mapId: "highbury",
          channel: activeChannel,
        })
        // 부팅 완료 시점이 미니 모드일 수 있음 (부팅 중 페이지 이탈) — 씬 create 이후에
        // 현재 모드를 재통지해 키보드 상태를 맞춘다.
        setTimeout(() => sceneBridge.emit("pip:mode", { mini: isMiniRef.current }), 800)
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
      setCurrentOccupancy(null)
    }
  }, [identity, stadiumConfig, joinAttempt, desiredRoom])

  // 방 이동 안내 토스트 자동 소멸
  useEffect(() => {
    if (!switchMsg) return
    const t = setTimeout(() => setSwitchMsg(null), 4000)
    return () => clearTimeout(t)
  }, [switchMsg])

  // 방 목록 인원 스냅샷 — 패널 열 때 + 새로고침 (병렬 프로브)
  const refreshRoomCounts = useCallback(async () => {
    if (!stadiumConfig) return
    setCountsLoading(true)
    try {
      const { probeChannelOccupancy } = await import("@/lib/metaverse/realtime/sidescroll-channel")
      const supabase = createAnonClient()
      const entries = await Promise.all(
        Array.from({ length: stadiumConfig.channelCap }, (_, k) => k + 1).map(async (i) => {
          try {
            return [
              i,
              await probeChannelOccupancy(
                supabase,
                `${METAVERSE.CHANNEL_INDOOR_HIGHBURY}:room-${i}`
              ),
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
  }, [stadiumConfig])

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
      // 같은 desiredRoom 재선택(직전 이동이 만석 폴백된 뒤 재시도)에도 재실행되도록
      setJoinAttempt((n) => n + 1)
    },
    [roomIndex]
  )

  // 풀스크린 동안 body 스크롤 잠금 — 미니 모드에선 페이지 스크롤이 살아야 하므로 해제.
  useEffect(() => {
    if (isMini) return
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
  }, [isMini])

  // 씬 키보드 차단/복원 — 미니 창이 페이지 탐색(스크롤·타이핑)을 방해하지 않도록
  const isMiniRef = useRef(isMini)
  useEffect(() => {
    isMiniRef.current = isMini
    sceneBridge.emit("pip:mode", { mini: isMini })
  }, [isMini])

  // 미니 채팅 티커 — 미니 모드에서 오가는 채팅을 작게 표시 (최근 3개, 8초 후 소멸).
  // ChatLogPanel 은 미니에서 언마운트되지만 chat:log:append 는 채널 콜백에서 계속 emit 됨.
  const [miniChats, setMiniChats] = useState<
    Array<{ key: number; nickname: string; text: string }>
  >([])
  useEffect(() => {
    if (!isMini) {
      setMiniChats([])
      return
    }
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const unsub = sceneBridge.on("chat:log:append", ({ nickname, text }) => {
      const key = Date.now() + Math.random()
      setMiniChats((prev) => [...prev.slice(-2), { key, nickname, text }])
      const t = setTimeout(() => {
        timers.delete(t)
        setMiniChats((prev) => prev.filter((m) => m.key !== key))
      }, 8000)
      timers.add(t)
    })
    return () => {
      unsub()
      for (const t of timers) clearTimeout(t)
    }
  }, [isMini])

  // 로딩 상태 — Phaser 부팅 안 함 (게스트 모드면 Clerk 결과 기다리지 않음)
  if (!mounted || (!isLoaded && !allowGuest)) {
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

  if (allFull && stadiumConfig) {
    return (
      <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-2xl">🈵</p>
          <h1 className="mt-3 text-lg font-bold">스타디움이 가득 찼어요</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            지금 열려 있는 방 {stadiumConfig.channelCap}개(방당 {stadiumConfig.capacityPerChannel}
            명)가 모두 만석이에요.
            <br />방 개수는 <b className="text-white/85">아스날 경기장 레벨</b>(현재 Lv.
            {stadiumConfig.stadiumLevel})만큼 열려요 — 경기장에 기부해서 레벨을 올리면 새 방이
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
      className={
        pip
          ? "relative h-full w-full overflow-hidden bg-neutral-950"
          : "fixed inset-x-0 mx-auto max-w-[1280px] overflow-hidden bg-neutral-950"
      }
      style={pip ? undefined : { top: topOffset, bottom: 0 }}
    >
      <div ref={parentRef} className="h-full w-full" aria-label="하이버리 메타버스" />
      {/* 미니 모드 크롬 — 확대/닫기 + 현재 방 라벨. 오버레이 UI 는 풀 모드에서만. */}
      {isMini && pip && (
        <>
          <div className="absolute top-1.5 right-1.5 z-20 flex gap-1">
            <button
              onClick={pip.onExpand}
              aria-label="스타디움 크게 보기"
              className="rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm transition-colors hover:bg-black/90"
            >
              ⤢
            </button>
            <button
              onClick={pip.onClose}
              aria-label="스타디움 나가기"
              className="rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm transition-colors hover:bg-black/90"
            >
              ✕
            </button>
          </div>
          <button
            onClick={pip.onExpand}
            className="absolute bottom-1.5 left-1.5 z-20 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/85 backdrop-blur-sm"
          >
            🏟️ {roomIndex ? `${roomIndex}번 방` : "스타디움"}
            {currentOccupancy && stadiumConfig
              ? ` (${currentOccupancy}/${stadiumConfig.capacityPerChannel})`
              : ""}
          </button>
          {/* 미니 채팅 티커 — 최근 채팅이 작게 흐름 */}
          {miniChats.length > 0 && (
            <div className="pointer-events-none absolute right-1.5 bottom-8 left-1.5 z-20 space-y-0.5">
              {miniChats.map((m) => (
                <p
                  key={m.key}
                  className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] leading-tight text-white/90 backdrop-blur-sm"
                >
                  <span className="font-bold text-amber-300">{m.nickname}</span> {m.text}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {!isMini && (
        <>
          {/* 월드맵 링크 제거 (2026-07-02) — /metaverse/uk 는 프로덕션에서 이 페이지로
          리다이렉트라 눌러도 제자리. 월드맵 체인은 폐기 방향. */}
          <MetaverseHud
            locationLabel={
              roomIndex
                ? `🏟️ 하이버리 스타디움 · ${roomIndex}번 방${
                    currentOccupancy && stadiumConfig
                      ? ` (${currentOccupancy}/${stadiumConfig.capacityPerChannel})`
                      : ""
                  }`
                : "🏟️ 하이버리 스타디움"
            }
            actions={
              <button
                onClick={toggleSwitcher}
                className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-black/80"
              >
                🚪 방 목록
              </button>
            }
          />
          {/* 방 이동 안내 토스트 */}
          {switchMsg && (
            <div className="absolute top-16 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/12 bg-black/80 px-4 py-2 text-xs font-semibold text-white/90 shadow-lg backdrop-blur-sm">
              {switchMsg}
            </div>
          )}
          {/* 방 목록 패널 — 방별 인원 + 클릭 이동 */}
          {switcherOpen && stadiumConfig && (
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
                {Array.from({ length: stadiumConfig.channelCap }, (_, k) => k + 1).map((i) => {
                  const isCurrent = i === roomIndex
                  const cnt = isCurrent ? currentOccupancy : roomCounts?.[i]
                  const isFull =
                    typeof cnt === "number" && cnt >= 0 && cnt >= stadiumConfig.capacityPerChannel
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
                        {cnt == null || cnt < 0
                          ? "–"
                          : `${cnt}/${stadiumConfig.capacityPerChannel}`}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-white/45">
                방 개수는 아스날 경기장 레벨(Lv.{stadiumConfig.stadiumLevel})만큼 열려요
              </p>
            </div>
          )}
          {/* 조작 안내 — 데스크톱(키보드)에서만. 터치 디바이스는 TouchControls 오버레이가 대체. */}
          <div className="pointer-events-none absolute right-3 bottom-3 hidden rounded-md bg-black/65 px-3 py-1.5 text-[10px] text-white/70 shadow-lg backdrop-blur-sm [@media(pointer:fine)]:block">
            A/D · ←→ 이동 · Space 점프 · 도어 앞에서 W/↑ 진입 · Enter 채팅
          </div>
          {/* 모바일 터치 조작 — pointer:coarse 에서만 렌더 */}
          <TouchControls />
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
        </>
      )}
    </div>
  )
}
