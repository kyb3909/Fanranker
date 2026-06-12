"use client"

/**
 * ChatLogPanel — 채팅 히스토리 패널 (드래그/리사이즈 가능).
 *
 *  - 헤더 드래그 → 이동
 *  - 우하단 코너 드래그 → 리사이즈 (240×180 ~ 600×600)
 *  - 최소화 토글 (헤더 우측 ─ 버튼)
 *  - 위치/크기/접힘 상태 localStorage 영구 저장 (탭별)
 *  - 닉네임 클릭 → sceneBridge user:clicked 이벤트 → 뮤트/신고 팝오버
 *  - 본인 닉네임은 클릭 불가
 *  - 뮤트된 유저 메시지 필터링 (하단에 "N개 숨김")
 *
 * sceneBridge "chat:log:append" 로 받은 메시지 최대 50개 보관.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { getMutedUsers, onMuteChange } from "@/lib/metaverse/mute-list"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

interface LogEntry {
  id: string
  userId: string
  nickname: string
  text: string
  timestamp: number
  scope: "world" | "room" | "local"
}

/**
 * 반응형 앵커 방식 — 좌상단 (x,y) 고정 좌표 대신 우하단 (right,bottom) offset
 * 으로 저장. window resize 시 패널이 자동으로 viewport 우하단 쪽에 붙어있음.
 * 드래그 시엔 새 right/bottom 값을 계산해 저장.
 */
interface PanelLayout {
  right: number // 화면 우측에서 offset (px)
  bottom: number // 화면 하단에서 offset (px)
  w: number
  h: number
  collapsed: boolean
}

const MAX_ENTRIES = 50
const STORAGE_KEY = "metaverse:chatlog:layout-v2" // v2 — 앵커 방식으로 스키마 변경
const MIN_W = 240
const MIN_H = 180
const MAX_W = 600
const MAX_H = 600
const DEFAULT_RIGHT = 16
// 모바일 탭바 (h-14 = 56px + safe-area) + 채팅 입력창 여유. 데스크톱에서는 탭바
// 없지만 과하지 않은 여백. 패널은 상대 포지션 (position: absolute) 이므로
// 실제 viewport 기준이 아니라 /metaverse 페이지 래퍼(=100svh - 56px) 기준.
const DEFAULT_BOTTOM = 80

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function getDefaultLayout(): PanelLayout {
  return {
    right: DEFAULT_RIGHT,
    bottom: DEFAULT_BOTTOM,
    w: 288,
    h: 240,
    collapsed: false,
  }
}

/**
 * 게임 컨테이너(offsetParent) 밖으로 삐져나가지 않도록 right/bottom 을 clamp.
 * container dims 가 없으면 viewport 로 fallback (SSR · 초기 mount 직전).
 */
function clampLayout(l: PanelLayout, container: { w: number; h: number } | null): PanelLayout {
  const cw = container?.w ?? (typeof window !== "undefined" ? window.innerWidth : 0)
  const ch = container?.h ?? (typeof window !== "undefined" ? window.innerHeight : 0)
  const w = clamp(l.w, MIN_W, MAX_W)
  const h = clamp(l.h, MIN_H, MAX_H)
  const maxRight = Math.max(0, cw - w)
  const maxBottom = Math.max(0, ch - h)
  return {
    ...l,
    w,
    h,
    right: clamp(l.right, 0, maxRight),
    bottom: clamp(l.bottom, 0, maxBottom),
  }
}

function loadLayout(): PanelLayout {
  if (typeof window === "undefined") return getDefaultLayout()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultLayout()
    const parsed = JSON.parse(raw) as Partial<PanelLayout>
    const fallback = getDefaultLayout()
    return {
      right: typeof parsed.right === "number" ? parsed.right : fallback.right,
      bottom: typeof parsed.bottom === "number" ? parsed.bottom : fallback.bottom,
      w: parsed.w ?? fallback.w,
      h: parsed.h ?? fallback.h,
      collapsed: !!parsed.collapsed,
    }
  } catch {
    return getDefaultLayout()
  }
}

function saveLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    /* noop */
  }
}

export function ChatLogPanel({ identity }: { identity?: MetaversePlayerIdentity }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [layout, setLayout] = useState<PanelLayout>(() => loadLayout())
  const [unread, setUnread] = useState(0)
  /** append 콜백에서 최신 접힘 상태 참조용 (구독은 mount 1회라 state 캡처 불가) */
  const collapsedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // HTMLElement ref — div(펼침) 과 button(접힘) 둘 다 받기 위해
  const panelRef = useRef<HTMLElement | null>(null)
  /** offsetParent (= 게임 컨테이너) 크기 — 드래그/리사이즈 범위 제한에 사용. */
  const containerSizeRef = useRef<{ w: number; h: number } | null>(null)
  const selfUserId = identity?.userId

  /** 현재 offsetParent dims 측정 (mount 후에만 유효). */
  const measureContainer = useCallback((): { w: number; h: number } | null => {
    const el = panelRef.current
    if (!el) return null
    const parent = el.offsetParent as HTMLElement | null
    if (!parent) return null
    return { w: parent.clientWidth, h: parent.clientHeight }
  }, [])

  // 최초 mount 시 container 측정 + layout clamp (offsetParent 기준).
  useEffect(() => {
    const size = measureContainer()
    containerSizeRef.current = size
    setLayout((prev) => clampLayout(prev, size))
  }, [measureContainer])

  // 메시지/뮤트 구독
  useEffect(() => {
    setMuted(getMutedUsers())
    const unsubAppend = sceneBridge.on("chat:log:append", (m) => {
      if (!m) return
      // 접힘 상태에서 받은 남의 메시지만 unread 증가 — 펼치거나 접을 때는 toggleCollapsed 가 리셋
      if (collapsedRef.current && m.userId !== selfUserId) setUnread((c) => c + 1)
      setEntries((prev) => {
        const entry: LogEntry = {
          id: `${m.userId}-${m.timestamp}-${prev.length}`,
          userId: m.userId,
          nickname: m.nickname,
          text: m.text,
          timestamp: m.timestamp,
          scope: m.scope,
        }
        return [...prev, entry].slice(-MAX_ENTRIES)
      })
    })
    const unsubMute = onMuteChange(() => setMuted(getMutedUsers()))
    return () => {
      unsubAppend()
      unsubMute()
    }
  }, [selfUserId])

  // collapsedRef 동기화 — append 콜백이 최신 접힘 상태를 보게 함
  useEffect(() => {
    collapsedRef.current = layout.collapsed
  }, [layout.collapsed])

  // 자동 스크롤
  useEffect(() => {
    if (!layout.collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, layout.collapsed])

  const updateLayout = useCallback((next: Partial<PanelLayout>) => {
    setLayout((prev) => {
      const merged = { ...prev, ...next }
      saveLayout(merged)
      return merged
    })
  }, [])

  const toggleCollapsed = useCallback(() => {
    setLayout((prev) => {
      const merged = { ...prev, collapsed: !prev.collapsed }
      saveLayout(merged)
      return merged
    })
    setUnread(0)
  }, [])

  // 컨테이너(offsetParent) 또는 viewport 리사이즈 시 clamp. 우하단 앵커라 CSS
  // right/bottom 이 자동으로 container 우하단을 따라가지만, 컨테이너가 작아지면
  // 음수 될 수 있어 clamp.
  useEffect(() => {
    const onResize = () => {
      const size = measureContainer()
      containerSizeRef.current = size
      setLayout((prev) => {
        const clamped = clampLayout(prev, size)
        if (
          clamped.right !== prev.right ||
          clamped.bottom !== prev.bottom ||
          clamped.w !== prev.w ||
          clamped.h !== prev.h
        ) {
          saveLayout(clamped)
        }
        return clamped
      })
    }
    window.addEventListener("resize", onResize)
    // offsetParent 자체가 리사이즈 돼도 (max-w-1280 vs viewport 변화) 반응
    let ro: ResizeObserver | null = null
    const parent = panelRef.current?.offsetParent as HTMLElement | null
    if (parent && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize)
      ro.observe(parent)
    }
    return () => {
      window.removeEventListener("resize", onResize)
      ro?.disconnect()
    }
  }, [measureContainer])

  // 드래그 핸들러 — 헤더에서 시작. container 의 우하단 기준 offset 으로 저장.
  // 컨테이너 밖으로는 안 나감 (clampLayout 이 offsetParent 크기로 제한).
  const startDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 헤더 내부 버튼 클릭은 드래그 아님
      if ((e.target as HTMLElement).closest("button")) return
      e.preventDefault()
      const startRight = layout.right
      const startBottom = layout.bottom
      const startX = e.clientX
      const startY = e.clientY
      const onMove = (ev: MouseEvent) => {
        // 마우스가 우측으로 dx 이동 → 패널도 우측으로 이동 → right 는 dx 만큼 감소
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        setLayout((prev) =>
          clampLayout(
            {
              ...prev,
              right: startRight - dx,
              bottom: startBottom - dy,
            },
            containerSizeRef.current
          )
        )
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        setLayout((prev) => {
          saveLayout(prev)
          return prev
        })
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [layout.right, layout.bottom]
  )

  /**
   * 4 꼭지 모두 리사이즈 가능.
   *
   * 앵커 규칙 (드래그한 코너의 대각 반대 코너가 고정):
   *   TL: 대각 BR 고정 → w/h 증가 시 right/bottom 유지
   *   TR: 대각 BL 고정 → w 증가는 right 감소, h 증가는 bottom 유지
   *   BL: 대각 TR 고정 → w 증가는 right 유지, h 증가는 bottom 감소
   *   BR: 대각 TL 고정 → w/h 증가 시 right/bottom 둘 다 감소
   */
  const startResize = useCallback(
    (corner: "tl" | "tr" | "bl" | "br") => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const startW = layout.w
      const startH = layout.h
      const startRight = layout.right
      const startBottom = layout.bottom
      const startX = e.clientX
      const startY = e.clientY
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        // 각 코너별로 부호 결정 (mw/mh = w/h 증감, mr/mb = right/bottom 증감)
        let mw = 0,
          mh = 0,
          mr = 0,
          mb = 0
        if (corner === "tl") {
          mw = -dx
          mh = -dy
        } else if (corner === "tr") {
          mw = dx
          mh = -dy
          mr = -dx
        } else if (corner === "bl") {
          mw = -dx
          mh = dy
          mb = -dy
        } else {
          // br
          mw = dx
          mh = dy
          mr = -dx
          mb = -dy
        }
        setLayout((prev) =>
          clampLayout(
            {
              ...prev,
              w: startW + mw,
              h: startH + mh,
              right: startRight + mr,
              bottom: startBottom + mb,
            },
            containerSizeRef.current
          )
        )
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        setLayout((prev) => {
          saveLayout(prev)
          return prev
        })
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [layout.w, layout.h, layout.right, layout.bottom]
  )

  const visible = useMemo(() => entries.filter((e) => !muted.has(e.userId)), [entries, muted])
  const hiddenCount = entries.length - visible.length

  const onNicknameClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, entry: LogEntry) => {
      if (entry.userId === selfUserId) return
      const rect = e.currentTarget.getBoundingClientRect()
      sceneBridge.emit("user:clicked", {
        userId: entry.userId,
        nickname: entry.nickname,
        screenX: rect.left + rect.width / 2,
        screenY: rect.top,
      })
    },
    [selfUserId]
  )

  // 접힌 상태 — 작은 FAB 버튼만. 앵커 그대로 우하단 기준.
  if (layout.collapsed) {
    return (
      <button
        ref={(el) => {
          panelRef.current = el
        }}
        onClick={toggleCollapsed}
        style={{ right: layout.right, bottom: layout.bottom, position: "absolute", zIndex: 20 }}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
        aria-label="채팅 로그 열기"
      >
        <span aria-hidden>💬</span>
        <span>채팅</span>
        {unread > 0 && (
          <span className="bg-primary rounded-full px-1.5 py-0.5 text-[9px] text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      ref={(el) => {
        panelRef.current = el
      }}
      style={{
        right: layout.right,
        bottom: layout.bottom,
        width: layout.w,
        height: layout.h,
        position: "absolute",
        zIndex: 20,
      }}
      className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black/75 backdrop-blur-sm"
    >
      {/* 헤더 — 드래그 핸들 */}
      <div
        onMouseDown={startDrag}
        className="flex cursor-move items-center justify-between border-b border-white/10 px-3 py-2 select-none"
      >
        <span className="text-[11px] font-semibold tracking-wide text-white/80">💬 채팅 로그</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleCollapsed}
            className="rounded px-1.5 text-[13px] leading-none text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="접기"
            title="접기"
          >
            —
          </button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-white/35">아직 메시지가 없어요</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((e) => {
              const isSelf = e.userId === selfUserId
              return (
                <li key={e.id} className="text-[11px] leading-snug">
                  <button
                    onClick={(ev) => onNicknameClick(ev, e)}
                    disabled={isSelf}
                    className={`font-semibold ${
                      isSelf
                        ? "cursor-default text-white/80"
                        : "cursor-pointer text-white/90 hover:text-white hover:underline"
                    }`}
                    title={isSelf ? "나" : "클릭해서 뮤트/신고"}
                  >
                    {e.nickname}
                  </button>
                  <span className="mx-1 text-white/30">·</span>
                  <span className="break-all text-white/85">{e.text}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {hiddenCount > 0 && (
        <div className="border-t border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] text-white/45">
          뮤트된 유저 {hiddenCount}개 메시지 숨김
        </div>
      )}

      {/* 4 꼭지 리사이즈 핸들 — 각 코너 16×16 투명 hotspot.
          대각선 커서 (nwse/nesw) 로 어느 꼭지인지 시각 힌트. */}
      <div
        onMouseDown={startResize("tl")}
        className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize"
        aria-label="좌상단 크기 조절"
        title="크기 조절"
      />
      <div
        onMouseDown={startResize("tr")}
        className="absolute top-0 right-0 h-4 w-4 cursor-nesw-resize"
        aria-label="우상단 크기 조절"
        title="크기 조절"
      />
      <div
        onMouseDown={startResize("bl")}
        className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize"
        aria-label="좌하단 크기 조절"
        title="크기 조절"
      />
      <div
        onMouseDown={startResize("br")}
        className="group absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
        aria-label="우하단 크기 조절"
        title="크기 조절"
      >
        {/* BR 에만 시각 힌트 아이콘 — 다른 코너는 커서로 판단 */}
        <svg
          viewBox="0 0 16 16"
          className="h-full w-full text-white/30 group-hover:text-white/70"
          aria-hidden
        >
          <path
            d="M15 6 L6 15 M15 10 L10 15 M15 14 L14 15"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  )
}
