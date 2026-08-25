"use client"

/**
 * ChatOverlay — 월드맵 하단 채팅 입력 오버레이.
 *
 * UX:
 *  - 기본: "Enter 키를 눌러 채팅" 힌트만 표시
 *  - Enter 누르면 입력창 열림 + 포커스
 *  - 입력 중 Enter → 전송, Escape → 닫기
 *  - 전송 후 2초 쿨다운
 *
 * 입력창이 열려있는 동안 Phaser 씬은 이동 입력 무시 (sceneBridge로 통지).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { METAVERSE } from "@/lib/metaverse/constants"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

const COOLDOWN_MS = METAVERSE.BUBBLE_COOLDOWN_MS

/**
 * 전송 버튼이 비활성화되려면 채널이 하나도 없는 경우인데, 현재 연결 상태는
 * 씬이 판정하므로 UI는 단순히 텍스트만 bridge로 보낸다.
 * 씬에서 room > world 순으로 라우팅.
 */
export function ChatOverlay({ canSend = true }: { canSend?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState("")
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setIsOpen(false)
    setText("")
    sceneBridge.emit("chat:input:close")
  }, [])

  const open = useCallback(() => {
    setIsOpen(true)
    sceneBridge.emit("chat:input:open")
  }, [])

  const send = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) {
      close()
      return
    }
    const now = Date.now()
    if (now < cooldownUntil) return
    if (!canSend) {
      close()
      return
    }
    sceneBridge.emit("chat:send", {
      text: trimmed.slice(0, METAVERSE.BUBBLE_MAX_CHARS),
    })
    setCooldownUntil(now + COOLDOWN_MS)
    setText("")
    close()
  }, [text, cooldownUntil, canSend, close])

  // 전역 Enter/Escape 리스너 — 입력창 닫혀있을 때만
  useEffect(() => {
    if (isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return
      // 포커스가 input/textarea 등 폼 요소면 무시 (다른 입력과 충돌 방지)
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      e.preventDefault()
      open()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, open])

  // 입력창 열리면 자동 포커스
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // 쿨다운 카운터
  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setRemaining(0)
      return
    }
    const tick = () => {
      const left = Math.max(0, cooldownUntil - Date.now())
      setRemaining(left)
      if (left <= 0) return
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [cooldownUntil])

  const charsLeft = METAVERSE.BUBBLE_MAX_CHARS - text.length

  if (!isOpen) {
    return (
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[12px] text-white/55 backdrop-blur-sm">
        <kbd className="rounded border border-white/20 px-1.5 text-[12px] font-semibold text-white/80">
          Enter
        </kbd>
        <span className="ml-2">키를 눌러 채팅</span>
        {remaining > 0 && (
          <span className="ml-3 text-white/40">쿨다운 {(remaining / 1000).toFixed(1)}s</span>
        )}
      </div>
    )
  }

  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/15 bg-black/80 px-3 py-2 backdrop-blur-sm">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, METAVERSE.BUBBLE_MAX_CHARS))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            send()
          } else if (e.key === "Escape") {
            e.preventDefault()
            close()
          }
        }}
        className="w-64 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
        placeholder="메시지…"
        maxLength={METAVERSE.BUBBLE_MAX_CHARS}
        aria-label="월드 채팅 입력"
      />
      <span className="text-[12px] text-white/40 tabular-nums">{charsLeft}</span>
      <button
        onClick={send}
        disabled={remaining > 0}
        className="rounded bg-white/10 px-2 py-1 text-[12px] text-white transition-colors hover:bg-white/20 disabled:opacity-40"
      >
        전송
      </button>
      <button
        onClick={close}
        className="rounded px-2 py-1 text-[12px] text-white/50 transition-colors hover:text-white"
      >
        Esc
      </button>
    </div>
  )
}
