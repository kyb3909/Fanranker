"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 클라이언트 Sentry 제거 (모바일 번들 165KB 감소). global-error 는 root layout
    // 자체가 깨졌을 때라 가장 치명적 — 향후 클라이언트 추적 다시 필요해지면 가장
    // 먼저 복원할 곳.
    console.error("[global-error]", error)
  }, [error])

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
            background: "#fafafa",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              서비스에 문제가 발생했습니다
            </h2>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
              잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의해주세요.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                background: "#991b1b",
                border: "none",
                borderRadius: 8,
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
