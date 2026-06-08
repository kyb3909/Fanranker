"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Check, LogOut, Users } from "lucide-react"
import { useDraftRoomRealtime } from "@/hooks/use-draft-room-realtime"
import type { DraftRoomWithSeats } from "@/lib/draft/rooms"

import "@/app/games/draft/draft-tokens.css"

interface WaitingRoomProps {
  initialRoom: DraftRoomWithSeats
  myUserId: string | null
  myDisplayName: string | null
}

const MIN_WAIT_BEFORE_AI_FILL_SEC = 30

export function WaitingRoom({ initialRoom, myUserId, myDisplayName }: WaitingRoomProps) {
  const router = useRouter()
  const { room, seats, presenceCount, isConnected } = useDraftRoomRealtime({
    roomId: initialRoom.id,
    initialRoom,
    myUserId,
    myDisplayName,
  })

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const activeSeats = useMemo(() => seats.filter((s) => !s.left_at), [seats])
  const mySeat = activeSeats.find((s) => s.user_id === myUserId) ?? null
  const isHost = mySeat?.is_host ?? false

  const createdAt = useMemo(() => new Date(room.created_at), [room.created_at])
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.floor((Date.now() - createdAt.getTime()) / 1000)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - createdAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  // 방 상태가 drafting 으로 바뀌면 진행 화면 라우팅
  useEffect(() => {
    if (room.status === "drafting") {
      router.push(`/games/draft/epl/room/${room.id}/play`)
    }
    if (room.status === "abandoned") {
      router.push("/games/draft/epl")
    }
  }, [room.status, room.id, router])

  const handleLeave = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await fetch(`/api/draft-rooms/${room.id}/leave`, {
        method: "POST",
      })
      router.push("/games/draft/epl")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "이탈 실패")
    } finally {
      setBusy(false)
    }
  }

  const handleStartNow = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/draft-rooms/${room.id}/start`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data?.error ?? "시작 실패")
        return
      }
      // status='drafting' 으로 바뀌면 위 useEffect 가 자동 라우팅
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "네트워크 오류")
    } finally {
      setBusy(false)
    }
  }

  const handleCopyInvite = async () => {
    try {
      const url = `${window.location.origin}/games/draft/epl/room/${room.id}`
      await navigator.clipboard.writeText(`초대 코드: ${room.invite_code}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const isLoggedIn = !!myUserId
  const canStartNow = isHost && activeSeats.length >= 1 && elapsedSec >= MIN_WAIT_BEFORE_AI_FILL_SEC
  const isFull = activeSeats.length >= room.max_participants
  const fullStartReady = isHost && isFull

  return (
    <div className="draft-scope draft-kraft" style={{ minHeight: "100vh", paddingBottom: 32 }}>
      {/* ─── 다크 헤더 ─── */}
      <div
        style={{
          background: "var(--draft-ink)",
          color: "var(--draft-paper)",
          borderBottom: "3px solid var(--draft-burgundy)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            className="draft-eyebrow"
            style={{
              color: "rgba(244,236,230,0.5)",
              fontSize: 9,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              className="draft-dot-live"
              style={{
                width: 6,
                height: 6,
                background: isConnected ? "var(--draft-burgundy)" : "var(--draft-mute)",
              }}
              aria-hidden
            />
            WAITING ROOM
          </div>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            EPL · {room.formation ?? "4-3-3"}
            <span
              className="draft-num"
              style={{
                fontSize: 12,
                color: "rgba(244,236,230,0.5)",
                fontWeight: 600,
              }}
            >
              {formatElapsed(elapsedSec)} 경과
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(244,236,230,0.08)",
            padding: "8px 14px",
            borderRadius: 999,
          }}
        >
          <Users size={14} style={{ opacity: 0.7 }} />
          <span
            className="draft-num"
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "-0.01em",
            }}
          >
            {activeSeats.length} / {room.max_participants}
          </span>
          {presenceCount > activeSeats.length && (
            <span
              style={{
                fontSize: 10,
                color: "rgba(244,236,230,0.6)",
                fontWeight: 600,
              }}
            >
              · 관전 {presenceCount - activeSeats.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyInvite}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            background: "transparent",
            border: "1.5px solid rgba(244,236,230,0.3)",
            color: "var(--draft-paper)",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          코드 {room.invite_code}
        </button>

        <button
          type="button"
          onClick={handleLeave}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            background: "transparent",
            border: "1.5px solid rgba(244,236,230,0.3)",
            color: "var(--draft-paper)",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <LogOut size={14} />
          나가기
        </button>
      </div>

      {/* ─── 본문 ─── */}
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {!isLoggedIn && (
          <div
            style={{
              background: "var(--draft-burgundy-soft)",
              color: "var(--draft-burgundy-deep)",
              padding: "12px 18px",
              borderRadius: 12,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            로그인하면 이 방에 참가할 수 있어요.
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              background: "var(--draft-burgundy-soft)",
              color: "var(--draft-burgundy-deep)",
              padding: "10px 16px",
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* 좌석 4개 grid */}
        <div>
          <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 8 }}>
            01 · 참가자
          </div>
          <h2
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: "-0.025em",
              marginBottom: 18,
            }}
          >
            {activeSeats.length} / {room.max_participants}명 모임
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {Array.from({ length: room.max_participants }).map((_, i) => {
              const seat = activeSeats.find((s) => s.seat_index === i)
              return <SeatCard key={i} seatIndex={i} seat={seat} mySeat={mySeat} />
            })}
          </div>
        </div>

        {/* 호스트 컨트롤 */}
        {isHost && (
          <div
            style={{
              background: "var(--draft-card)",
              border: "1px solid var(--draft-line)",
              borderRadius: 14,
              padding: "20px 22px",
              boxShadow: "var(--draft-shadow-1)",
            }}
          >
            <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 6 }}>
              02 · 호스트 컨트롤
            </div>
            <div
              style={{
                fontFamily: "var(--draft-font-title)",
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: "-0.02em",
                marginBottom: 14,
                color: "var(--draft-ink)",
              }}
            >
              {isFull
                ? "4명 모두 모였어요! 시작 준비됐어요."
                : `${room.max_participants - activeSeats.length}명 더 기다리는 중`}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleStartNow}
                disabled={!(canStartNow || fullStartReady)}
                style={{
                  background:
                    canStartNow || fullStartReady ? "var(--draft-burgundy)" : "var(--draft-soft)",
                  color: canStartNow || fullStartReady ? "white" : "var(--draft-mute)",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: 999,
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: canStartNow || fullStartReady ? "pointer" : "not-allowed",
                  transition: "background .15s",
                  letterSpacing: "-0.01em",
                }}
              >
                {fullStartReady
                  ? "지금 시작 →"
                  : canStartNow
                    ? `지금 시작 (부족분 AI 채움) →`
                    : `${Math.max(0, MIN_WAIT_BEFORE_AI_FILL_SEC - elapsedSec)}초 후 활성화`}
              </button>
            </div>

            <p
              className="draft-serif"
              style={{
                marginTop: 12,
                fontSize: 12,
                fontStyle: "normal",
                color: "var(--draft-mute)",
                lineHeight: 1.55,
              }}
            >
              4명이 다 모이면 바로 시작할 수 있어요. 30초 지나면 부족분을 AI 로 채워서 시작도
              가능해요.
            </p>
          </div>
        )}

        {/* 메타 정보 */}
        <div
          style={{
            background: "var(--draft-soft)",
            borderRadius: 14,
            padding: "18px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 18,
          }}
        >
          <MetaItem label="포메이션" value={room.formation ?? "4-3-3"} />
          <MetaItem label="예산" value={`£${room.budget}`} />
          <MetaItem label="라운드" value={`${room.total_rounds}`} suffix="라운드" />
          <MetaItem label="공개" value={room.is_private ? "비공개" : "공개"} />
          <MetaItem label="픽 제한" value="30초" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 보조 컴포넌트
// ─────────────────────────────────────────────

function SeatCard({
  seatIndex,
  seat,
  mySeat,
}: {
  seatIndex: number
  seat?: {
    id: string
    user_id: string | null
    display_name: string
    is_host: boolean
    is_ai: boolean
    ai_name: string | null
  }
  mySeat: { id: string } | null
}) {
  const isMe = !!seat && !!mySeat && seat.id === mySeat.id
  const name = seat?.is_ai ? (seat.ai_name ?? "AI") : seat?.display_name

  return (
    <div
      style={{
        background: "var(--draft-card)",
        border: `${seat ? 1.5 : 1}px ${seat ? "solid" : "dashed"} ${
          isMe ? "var(--draft-burgundy)" : seat ? "var(--draft-line)" : "var(--draft-rule)"
        }`,
        borderRadius: 14,
        padding: 18,
        minHeight: 130,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: isMe ? "0 0 0 4px rgba(160,32,59,0.13)" : "var(--draft-shadow-1)",
        transition: "all .2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="draft-num"
          style={{
            fontFamily: "var(--draft-font-title)",
            fontWeight: 900,
            fontSize: 11,
            color: "var(--draft-mute)",
            letterSpacing: "0.1em",
          }}
        >
          좌석 {seatIndex + 1}
        </span>
        {seat?.is_host && (
          <span
            style={{
              padding: "2px 8px",
              background: "var(--draft-burgundy)",
              color: "white",
              borderRadius: 999,
              fontSize: 9,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            HOST
          </span>
        )}
        {seat?.is_ai && (
          <span
            style={{
              padding: "2px 8px",
              background: "var(--draft-soft)",
              color: "var(--draft-mute)",
              borderRadius: 999,
              fontSize: 9,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            AI
          </span>
        )}
      </div>

      {seat ? (
        <>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: "var(--draft-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          {isMe && (
            <span
              style={{
                fontFamily: "var(--draft-font-title)",
                fontWeight: 800,
                fontSize: 11,
                color: "var(--draft-burgundy)",
                letterSpacing: "0.1em",
              }}
            >
              YOU
            </span>
          )}
        </>
      ) : (
        <>
          <div
            className="draft-serif"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--draft-mute)",
              fontStyle: "normal",
              fontSize: 14,
            }}
          >
            대기 중…
          </div>
        </>
      )}
    </div>
  )
}

function MetaItem({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="draft-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="draft-num"
        style={{
          fontFamily: "var(--draft-font-title)",
          fontWeight: 900,
          fontSize: 18,
          color: "var(--draft-ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
        {suffix && (
          <span
            style={{
              fontSize: 11,
              color: "var(--draft-mute)",
              marginLeft: 4,
              fontWeight: 600,
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 1) return `${s}초`
  if (m < 60) return `${m}분 ${s}초`
  const h = Math.floor(m / 60)
  return `${h}시간 ${m % 60}분`
}
