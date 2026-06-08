import type { Metadata } from "next"
import Link from "next/link"
import { listOpenRooms } from "@/lib/draft/rooms"
import { OpenRoomsGrid } from "@/components/draft/open-rooms-grid"

import "@/app/games/draft/draft-tokens.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "공개 드래프트 방 — 지금 모집 중",
  description: "지금 사람을 모으고 있는 EPL 드래프트 방. 클릭해서 바로 참가.",
}

export default async function OpenRoomsPage() {
  const rooms = await listOpenRooms(24)

  return (
    <div className="draft-scope draft-kraft" style={{ minHeight: "100vh", paddingBottom: 64 }}>
      {/* 다크 헤더 */}
      <div
        style={{
          background: "var(--draft-ink)",
          color: "var(--draft-paper)",
          borderBottom: "3px solid var(--draft-burgundy)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
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
            <span className="draft-dot-live" style={{ width: 6, height: 6 }} aria-hidden />
            OPEN ROOMS
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
            지금 모집 중
            <span
              className="draft-num"
              style={{
                fontSize: 12,
                color: "rgba(244,236,230,0.5)",
                fontWeight: 600,
              }}
            >
              {rooms.length}개 방
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <Link
          href="/games/draft/epl"
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            background: "var(--draft-burgundy)",
            color: "white",
            border: "none",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 800,
            fontSize: 13,
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          내 방 만들기 →
        </Link>
      </div>

      {/* 본문 */}
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="draft-eyebrow draft-eyebrow-burg">01 · 공개 대기방</div>
            <h2
              style={{
                fontSize: 28,
                letterSpacing: "-0.025em",
                fontFamily: "var(--draft-font-title)",
                fontWeight: 900,
                marginTop: 4,
              }}
            >
              누구나 들어올 수 있어요
            </h2>
          </div>
          <p
            className="draft-serif"
            style={{
              fontSize: 13,
              fontStyle: "normal",
              color: "var(--draft-mute)",
              maxWidth: 340,
              lineHeight: 1.55,
            }}
          >
            10초마다 자동 갱신. 카드 클릭으로 바로 참가.
          </p>
        </div>

        <OpenRoomsGrid initialRooms={rooms} />
      </div>
    </div>
  )
}
