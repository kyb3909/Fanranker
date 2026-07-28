"use client"

import { useState } from "react"

export default function CommunityError({ reset }: { error: Error; reset: () => void }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="worldcup-scope flex min-h-screen items-center justify-center px-4">
      <div className="text-center" style={{ maxWidth: 360 }}>
        {imgError ? (
          <div style={{ fontSize: 64, marginBottom: 20 }}>⚽</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/mascot/bet-slip.png"
            alt="⚽"
            width={96}
            height={96}
            style={{ margin: "0 auto 20px", display: "block" }}
            onError={() => setImgError(true)}
          />
        )}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "var(--wc-ink)",
            marginBottom: 8,
            wordBreak: "keep-all",
          }}
        >
          잠시 문제가 생겼어요
        </h2>
        <p style={{ fontSize: 14, color: "var(--wc-mute)", marginBottom: 24, lineHeight: 1.6 }}>
          게시판이 존재하지 않거나 일시적인 오류가 발생했습니다.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => (window.location.href = "/explore")}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid var(--wc-line-2)",
              background: "#fff",
              color: "var(--wc-ink)",
              cursor: "pointer",
            }}
          >
            탐색
          </button>
          <button
            onClick={() => reset()}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              background: "var(--wc-burgundy)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  )
}
