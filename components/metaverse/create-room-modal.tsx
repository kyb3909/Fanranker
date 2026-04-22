"use client"

/**
 * CreateRoomModal — Plot 위에서 "방 만들기" 클릭 시 열리는 모달.
 * 방 이름 입력 + 100P 비용 표시 + confirm.
 */

import { useEffect, useRef, useState } from "react"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/constants"
import type { ChatRoomMeta, MetaversePlayerIdentity } from "@/lib/metaverse/types"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { trackEvent } from "@/lib/analytics/events"

const SIGN_TEXT_MAX = 20
const COST = 100

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_balance: "활동 포인트가 부족합니다.",
  plot_occupied: "방금 다른 유저가 이 자리를 선점했습니다.",
  sign_text_required: "방 이름을 입력해주세요.",
  sign_text_too_long: `방 이름은 ${SIGN_TEXT_MAX}자 이하여야 합니다.`,
  plot_not_found: "유효하지 않은 자리입니다.",
}

export interface CreateRoomContext {
  plotId: string
  plotCode: string
  plazaName: string
}

export function CreateRoomModal({
  context,
  identity,
  onClose,
  onCreated,
}: {
  context: CreateRoomContext | null
  identity: MetaversePlayerIdentity
  onClose: () => void
  onCreated: (room: ChatRoomMeta) => void
}) {
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 모달 열려있는 동안 Phaser 씬의 키보드 입력 차단 (chat:input:open 재활용)
  useEffect(() => {
    if (!context) return
    sceneBridge.emit("chat:input:open")
    return () => sceneBridge.emit("chat:input:close")
  }, [context])

  useEffect(() => {
    if (context) {
      setText("")
      setError(null)
      // 다음 tick에 포커스 (트랜지션 이후)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [context])

  if (!context) return null

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(ERROR_MESSAGES.sign_text_required)
      return
    }
    if (trimmed.length > SIGN_TEXT_MAX) {
      setError(ERROR_MESSAGES.sign_text_too_long)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" }
      if (identity.userId.startsWith("guest-")) {
        headers[METAVERSE_GUEST_HEADER] = identity.userId
      }
      const res = await fetch("/api/metaverse/chat-rooms", {
        method: "POST",
        headers,
        body: JSON.stringify({ plotId: context.plotId, signText: trimmed, cost: COST }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const key = (data.error ?? "unknown") as string
        setError(ERROR_MESSAGES[key] ?? `알 수 없는 오류 (${key})`)
        return
      }
      if (data.room) onCreated(data.room as ChatRoomMeta)
      trackEvent({
        name: "metaverse_room_create",
        params: {
          plot_code: context.plotCode,
          sign_length: trimmed.length,
          cost: COST,
        },
      })
      onClose()
    } catch (err) {
      console.error("[metaverse] create room failed", err)
      setError("요청 실패. 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(92vw,400px)] rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">방 만들기</h2>
          <button
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="mt-1 text-[11px] text-white/50">
          {context.plazaName} · {context.plotCode}
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold text-white/70">간판 텍스트</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, SIGN_TEXT_MAX))
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void submit()
              } else if (e.key === "Escape") {
                e.preventDefault()
                onClose()
              }
            }}
            maxLength={SIGN_TEXT_MAX}
            placeholder="예: K리그 4주차 예상"
            className="mt-1 w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
          />
          <div className="mt-1 flex justify-between text-[10px] text-white/40">
            <span>다른 유저에게 이 텍스트가 간판에 보여요</span>
            <span className="tabular-nums">
              {text.length}/{SIGN_TEXT_MAX}
            </span>
          </div>
        </label>

        {error && (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="text-[12px] text-white/60">
            비용 <span className="font-bold text-white">{COST} P</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded px-3 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white disabled:opacity-40"
            >
              취소
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting || text.trim().length === 0}
              className="bg-primary hover:bg-primary/90 rounded px-3 py-1.5 text-[12px] font-semibold text-white transition-colors disabled:opacity-40"
            >
              {submitting ? "개설 중…" : "개설"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
