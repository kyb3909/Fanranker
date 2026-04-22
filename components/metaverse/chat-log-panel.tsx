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

interface PanelLayout {
  x: number
  y: number
  w: number
  h: number
  collapsed: boolean
}

const MAX_ENTRIES = 50
const STORAGE_KEY = "metaverse:chatlog:layout"
const MIN_W = 240
const MIN_H = 180
const MAX_W = 600
const MAX_H = 600

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function getDefaultLayout(): PanelLayout {
  if (typeof window === "undefined") {
    return { x: 0, y: 0, w: 288, h: 240, collapsed: false }
  }
  // 우하단 기본 배치 — 하단 80px (ChatOverlay/PlotActionOverlay 위)
  const w = 288
  const h = 240
  return {
    x: clamp(window.innerWidth - w - 16, 0, Math.max(0, window.innerWidth - w)),
    y: clamp(window.innerHeight - h - 80, 0, Math.max(0, window.innerHeight - h)),
    w,
    h,
    collapsed: false,
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
      x: clamp(
        typeof parsed.x === "number" ? parsed.x : fallback.x,
        0,
        Math.max(0, window.innerWidth - (parsed.w ?? fallback.w))
      ),
      y: clamp(
        typeof parsed.y === "number" ? parsed.y : fallback.y,
        0,
        Math.max(0, window.innerHeight - (parsed.h ?? fallback.h))
      ),
      w: clamp(parsed.w ?? fallback.w, MIN_W, MAX_W),
      h: clamp(parsed.h ?? fallback.h, MIN_H, MAX_H),
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const selfUserId = identity?.userId

  // 최초 mount 시 한 번 더 로드 (SSR→hydrate 경계에서 올바른 viewport 로 복구)
  useEffect(() => {
    setLayout(loadLayout())
  }, [])

  // 메시지/뮤트 구독
  useEffect(() => {
    setMuted(getMutedUsers())
    const unsubAppend = sceneBridge.on("chat:log:append", (m) => {
      if (!m) return
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
  }, [])

  // 접혀있을 때 새 메시지 unread 카운트
  useEffect(() => {
    if (layout.collapsed && entries.length > 0) {
      setUnread((c) => c + 1)
    }
  }, [entries.length, layout.collapsed])

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

  // 뷰포트 리사이즈 시 clamp — 패널이 밖으로 나가지 않게
  useEffect(() => {
    const onResize = () => {
      setLayout((prev) => {
        const clamped = {
          ...prev,
          x: clamp(prev.x, 0, Math.max(0, window.innerWidth - prev.w)),
          y: clamp(prev.y, 0, Math.max(0, window.innerHeight - prev.h)),
        }
        if (clamped.x !== prev.x || clamped.y !== prev.y) saveLayout(clamped)
        return clamped
      })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // 드래그 핸들러 — 헤더에서 시작
  const startDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 헤더 내부 버튼 클릭은 드래그 아님
      if ((e.target as HTMLElement).closest("button")) return
      e.preventDefault()
      const startX = e.clientX - layout.x
      const startY = e.clientY - layout.y
      const onMove = (ev: MouseEvent) => {
        const nx = clamp(ev.clientX - startX, 0, window.innerWidth - layout.w)
        const ny = clamp(ev.clientY - startY, 0, window.innerHeight - layout.h)
        setLayout((prev) => ({ ...prev, x: nx, y: ny }))
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
    [layout.x, layout.y, layout.w, layout.h]
  )

  // 리사이즈 핸들러 — 우하단 코너
  const startResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const startW = layout.w
      const startH = layout.h
      const startX = e.clientX
      const startY = e.clientY
      const onMove = (ev: MouseEvent) => {
        const nw = clamp(startW + (ev.clientX - startX), MIN_W, MAX_W)
        const nh = clamp(startH + (ev.clientY - startY), MIN_H, MAX_H)
        setLayout((prev) => ({
          ...prev,
          w: nw,
          h: nh,
          x: clamp(prev.x, 0, Math.max(0, window.innerWidth - nw)),
          y: clamp(prev.y, 0, Math.max(0, window.innerHeight - nh)),
        }))
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
    [layout.w, layout.h]
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

  // 접힌 상태 — 작은 FAB 버튼만
  if (layout.collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        style={{ left: layout.x, top: layout.y, position: "absolute", zIndex: 20 }}
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
      style={{
        left: layout.x,
        top: layout.y,
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

      {/* 리사이즈 핸들 — 우하단 코너 */}
      <div
        onMouseDown={startResize}
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
        aria-label="크기 조절"
        title="드래그해서 크기 조절"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-full w-full text-white/30 hover:text-white/70"
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
