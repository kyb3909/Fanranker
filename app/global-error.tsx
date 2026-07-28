"use client"

import { useEffect, useState } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global-error]", error)
  }, [error])

  const [imgError, setImgError] = useState(false)

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "#f7f6f3",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 360 }}>
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
                marginBottom: 8,
                color: "#111",
                wordBreak: "keep-all",
              }}
            >
              잠시 문제가 생겼어요
            </h2>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 24, lineHeight: 1.6 }}>
              서비스에 일시적인 오류가 발생했습니다. 다시 시도해주세요.
            </p>
            <button
              onClick={() => reset()}
              style={{
                height: 44,
                padding: "0 24px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: "#961E37",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
