"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Users } from "lucide-react"
import type { OpenRoomSummary } from "@/lib/draft/rooms"

import "@/app/games/draft/draft-tokens.css"

interface OpenRoomsGridProps {
  initialRooms: OpenRoomSummary[]
  /** 임베드 모드 — setup 화면 안에서 사용. 카드 3-6개만, 작은 사이즈. */
  embedded?: boolean
  /** 임베드일 때 보여줄 최대 개수 */
  embedLimit?: number
}

const POLL_INTERVAL_MS = 10_000

export function OpenRoomsGrid({
  initialRooms,
  embedded = false,
  embedLimit = 4,
}: OpenRoomsGridProps) {
  const [rooms, setRooms] = useState<OpenRoomSummary[]>(initialRooms)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch("/api/draft-rooms?limit=24", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setRooms(data.rooms ?? [])
      } catch {
        // ignore
      }
    }
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const visibleRooms = embedded ? rooms.slice(0, embedLimit) : rooms

  if (visibleRooms.length === 0) {
    return (
      <div
        className="draft-scope"
        style={{
          padding: embedded ? "16px 18px" : "48px 24px",
          textAlign: "center",
          background: embedded ? "transparent" : "var(--draft-soft)",
          borderRadius: embedded ? 0 : 14,
          border: embedded ? "1px dashed var(--draft-rule)" : "none",
        }}
      >
        <p
          className="draft-serif"
          style={{
            fontSize: embedded ? 13 : 16,
            fontStyle: "normal",
            color: "var(--draft-mute)",
            lineHeight: 1.55,
          }}
        >
          {embedded
            ? "지금 모집 중인 공개 방이 없어요."
            : "지금 모집 중인 방이 없어요. 위에서 새 방을 만들어보세요."}
        </p>
      </div>
    )
  }

  return (
    <div
      className="draft-scope"
      style={{
        display: "grid",
        gridTemplateColumns: embedded ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
        gap: embedded ? 8 : 14,
      }}
    >
      {visibleRooms.map((room) => (
        <RoomCard key={room.id} room={room} embedded={embedded} />
      ))}
    </div>
  )
}

function RoomCard({ room, embedded }: { room: OpenRoomSummary; embedded: boolean }) {
  const isFull = room.current_count >= room.max_participants
  const elapsedMin = Math.max(
    1,
    Math.floor((Date.now() - new Date(room.created_at).getTime()) / 60_000)
  )

  return (
    <Link
      href={`/games/draft/${room.game_slug}/room/${room.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          background: "var(--draft-card)",
          border: `1px solid ${isFull ? "var(--draft-rule)" : "var(--draft-line)"}`,
          borderRadius: 12,
          padding: embedded ? "12px 14px" : "16px 18px",
          display: "flex",
          flexDirection: embedded ? "row" : "column",
          alignItems: embedded ? "center" : "stretch",
          gap: embedded ? 12 : 10,
          boxShadow: "var(--draft-shadow-1)",
          transition: "transform .15s, box-shadow .15s",
          opacity: isFull ? 0.7 : 1,
          cursor: isFull ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (isFull) return
          e.currentTarget.style.transform = "translateY(-2px)"
          e.currentTarget.style.boxShadow = "var(--draft-shadow-2)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none"
          e.currentTarget.style.boxShadow = "var(--draft-shadow-1)"
        }}
      >
        {/* 좌측: 호스트 + 포메이션 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: embedded ? 24 : 30,
                height: embedded ? 24 : 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--draft-burgundy), var(--draft-violet))",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: embedded ? 11 : 13,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {room.host_display_name.charAt(0)}
            </div>
            <span
              style={{
                fontWeight: 800,
                fontSize: embedded ? 13 : 15,
                color: "var(--draft-ink)",
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {room.host_display_name}
            </span>
            <span
              className="draft-num"
              style={{
                fontSize: 10,
                color: "var(--draft-mute)",
                fontWeight: 600,
                marginLeft: "auto",
                flexShrink: 0,
              }}
            >
              {elapsedMin}분 전
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: embedded ? 11 : 12,
              color: "var(--draft-mute)",
              fontWeight: 600,
            }}
          >
            <span>EPL · {room.formation ?? "4-3-3"}</span>
            <span style={{ color: "var(--draft-rule)" }}>·</span>
            <span className="draft-num" style={{ fontWeight: 700 }}>
              {room.invite_code}
            </span>
          </div>
        </div>

        {/* 우측: 인원 + 참가 액션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: embedded ? 8 : 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: isFull ? "var(--draft-soft)" : "var(--draft-burgundy-soft)",
              color: isFull ? "var(--draft-mute)" : "var(--draft-burgundy)",
              padding: "5px 10px",
              borderRadius: 999,
              fontWeight: 900,
              fontSize: embedded ? 11 : 13,
              letterSpacing: "-0.01em",
            }}
          >
            <Users size={11} />
            <span className="draft-num">
              {room.current_count}/{room.max_participants}
            </span>
          </div>
          {!embedded && (
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: isFull ? "var(--draft-soft)" : "var(--draft-ink)",
                color: isFull ? "var(--draft-mute)" : "var(--draft-paper)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
              }}
              aria-hidden
            >
              →
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
