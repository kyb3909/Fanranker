"use client"

import React from "react"

interface ClerkErrorBoundaryState {
  hasError: boolean
}

export class ClerkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ClerkErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ClerkErrorBoundaryState {
    // Clerk 로딩 실패 에러만 캐치
    if (
      error.message?.includes("Failed to load Clerk") ||
      error.message?.includes("failed_to_load_clerk_js") ||
      error.name === "ClerkRuntimeError"
    ) {
      return { hasError: true }
    }
    // Clerk 관련이 아닌 에러는 상위로 전파
    throw error
  }

  render() {
    if (this.state.hasError) {
      return (
        <html lang="ko">
          <body>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                padding: "2rem",
                fontFamily: "system-ui, sans-serif",
                textAlign: "center",
                color: "#333",
              }}
            >
              <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
                로그인 서비스에 연결할 수 없어요
              </h2>
              <p
                style={{
                  color: "#666",
                  marginBottom: "1.5rem",
                  maxWidth: "400px",
                  lineHeight: 1.6,
                }}
              >
                일시적인 네트워크 문제일 수 있어요.
                <br />
                잠시 후 다시 시도해주세요.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.625rem 1.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#fff",
                  backgroundColor: "#171717",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                }}
              >
                새로고침
              </button>
            </div>
          </body>
        </html>
      )
    }

    return this.props.children
  }
}
