'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import type { RoomParticipant, DraftRoom } from '@/lib/draft/types'
import { SEAT_COLORS } from '@/lib/draft/utils'
import { isBotUser } from '@/lib/draft/bot'

interface RoomLobbyProps {
  room: DraftRoom
  participants: RoomParticipant[]
  myUserId: string | null
  onReady: () => Promise<void>
  onStart: () => Promise<void>
  onLeave: () => Promise<void>
  onFillBots: () => Promise<void>
}

export function RoomLobby({ room, participants, myUserId, onReady, onStart, onLeave, onFillBots }: RoomLobbyProps) {
  const [loading, setLoading] = useState(false)
  const [botCountdown, setBotCountdown] = useState<number | null>(null)
  const botTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const botTriggeredRef = useRef(false)

  const isHost = room.host_user_id === myUserId
  const me = participants.find(p => p.user_id === myUserId)
  const humanCount = participants.filter(p => !isBotUser(p.user_id)).length
  const allReady = participants
    .filter(p => p.user_id !== room.host_user_id && !isBotUser(p.user_id))
    .every(p => p.is_ready)
  const canStart = isHost && participants.length >= 2 && allReady

  // TODO: 봇 자동 타이머 — 기획 완성 후 활성화
  // useEffect(() => {
  //   if (humanCount === 1 && isHost && !botTriggeredRef.current) {
  //     setBotCountdown(60)
  //     const start = Date.now()
  //     botTimerRef.current = setInterval(() => {
  //       const elapsed = Math.floor((Date.now() - start) / 1000)
  //       const remaining = Math.max(0, 60 - elapsed)
  //       setBotCountdown(remaining)
  //       if (remaining <= 0) {
  //         if (botTimerRef.current) clearInterval(botTimerRef.current)
  //         if (!botTriggeredRef.current) { botTriggeredRef.current = true; onFillBots() }
  //       }
  //     }, 1000)
  //     return () => { if (botTimerRef.current) clearInterval(botTimerRef.current) }
  //   } else {
  //     setBotCountdown(null)
  //     if (botTimerRef.current) { clearInterval(botTimerRef.current); botTimerRef.current = null }
  //   }
  // }, [humanCount, isHost, onFillBots])

  const handleReady = async () => {
    setLoading(true)
    try { await onReady() } finally { setLoading(false) }
  }

  const handleStart = async () => {
    setLoading(true)
    try { await onStart() } finally { setLoading(false) }
  }

  const handleFillBots = async () => {
    if (botTriggeredRef.current || loading) return
    setLoading(true)
    botTriggeredRef.current = true
    if (botTimerRef.current) { clearInterval(botTimerRef.current); botTimerRef.current = null }
    setBotCountdown(null)
    try { await onFillBots() } finally { setLoading(false) }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Room Code */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">방 코드</p>
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted px-6 py-3">
          <span className="text-2xl font-mono font-bold tracking-widest text-foreground">
            {room.room_code}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(room.room_code)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="복사"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* TODO: 봇 카운트다운 — 기획 완성 후 활성화 */}

      {/* Seats */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((seatIndex) => {
          const p = participants.find(pp => pp.seat_index === seatIndex)
          const color = SEAT_COLORS[seatIndex]
          const isBot = p ? isBotUser(p.user_id) : false

          return (
            <div
              key={seatIndex}
              className={`relative rounded-xl border-2 p-4 transition-all ${
                p
                  ? `${color.light} border-current ${color.text}`
                  : 'border-dashed border-border bg-muted/30'
              }`}
            >
              {p ? (
                <div className="flex flex-col items-center gap-2">
                  {p.avatar_url ? (
                    <Image
                      src={p.avatar_url}
                      alt={p.display_name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className={`h-10 w-10 rounded-full ${color.bg} flex items-center justify-center text-white text-sm font-bold`}>
                      {isBot ? '🤖' : p.display_name.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground truncate max-w-full">
                    {p.display_name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${color.text}`}>
                      {color.name} 팀
                    </span>
                    {p.user_id === room.host_user_id && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        방장
                      </span>
                    )}
                    {isBot && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        봇
                      </span>
                    )}
                  </div>
                  {p.is_ready && p.user_id !== room.host_user_id && (
                    <span className="text-xs text-green-600 font-medium">준비 완료</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <svg className="h-5 w-5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="text-xs text-muted-foreground">대기 중...</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!canStart || loading}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '시작 중...' : participants.length < 2 ? '2명 이상 필요' : !allReady ? '모든 참가자 준비 대기' : '게임 시작'}
          </button>
        ) : (
          <button
            onClick={handleReady}
            disabled={loading}
            className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              me?.is_ready
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {loading ? '변경 중...' : me?.is_ready ? '준비 완료 (취소하려면 클릭)' : '준비'}
          </button>
        )}

        {/* TODO: 봇 채우기 버튼 — 기획 완성 후 활성화 */}

        <button
          onClick={onLeave}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          나가기
        </button>
      </div>
    </div>
  )
}
