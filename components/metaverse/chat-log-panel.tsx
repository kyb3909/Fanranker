"use client"

/**
 * ChatLogPanel — 주고받은 채팅 히스토리 우하단 패널.
 *
 *  - sceneBridge "chat:log:append" 로 받은 메시지를 최대 50개까지 보관
 *  - 뮤트된 유저 메시지는 자동 필터링 (하단에 "뮤트된 N개 숨김" 표시)
 *  - 새 메시지 오면 자동 스크롤
 *  - 헤더 클릭하면 접힘 (최소화)
 *
 * 월드 채팅 (proximity 통과) + 방 채팅 + 로컬(데모) 세 가지 scope 공용.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { getMutedUsers, onMuteChange } from "@/lib/metaverse/mute-list"

interface LogEntry {
  id: string
  userId: string
  nickname: string
  text: string
  timestamp: number
  scope: "world" | "room" | "local"
}

const MAX_ENTRIES = 50

export function ChatLogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // 접혀있을 때 새 메시지 카운트. 펼치면 리셋.
  useEffect(() => {
    if (collapsed && entries.length > 0) {
      setUnread((c) => c + 1)
    }
  }, [entries.length, collapsed])

  // 자동 스크롤 (펼쳐져 있을 때만)
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, collapsed])

  const expand = useCallback(() => {
    setCollapsed(false)
    setUnread(0)
  }, [])

  const visible = entries.filter((e) => !muted.has(e.userId))
  const hiddenCount = entries.length - visible.length

  if (collapsed) {
    return (
      <button
        onClick={expand}
        className="absolute right-4 bottom-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
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
    <div className="absolute right-4 bottom-20 z-20 w-72 overflow-hidden rounded-lg border border-white/10 bg-black/75 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-semibold tracking-wide text-white/80">💬 채팅 로그</span>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded px-1.5 text-[13px] leading-none text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="접기"
        >
          —
        </button>
      </div>
      <div ref={scrollRef} className="max-h-56 overflow-y-auto px-3 py-2">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-white/35">아직 메시지가 없어요</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((e) => (
              <li key={e.id} className="text-[11px] leading-snug">
                <span className="font-semibold text-white/90">{e.nickname}</span>
                <span className="mx-1 text-white/30">·</span>
                <span className="break-all text-white/85">{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hiddenCount > 0 && (
        <div className="border-t border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] text-white/45">
          뮤트된 유저 {hiddenCount}개 메시지 숨김
        </div>
      )}
    </div>
  )
}
