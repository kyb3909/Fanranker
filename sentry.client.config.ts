import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  // 클라이언트 트레이싱 비활성화 — Vercel Analytics + Lighthouse로 페이지 로드 성능 측정.
  // Sentry는 에러 캡처 전용. excludeTracing(next.config.mjs)와 함께 BrowserTracing 코드 트리쉐이킹.
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  debug: false,

  // 초기 번들 감소: Replay/BrowserTracing은 기본 integration에서 제외.
  // Replay는 첫 에러 발생 시 lazy-load (아래 코드 참조).
  integrations: (integrations) =>
    integrations.filter((i) => i.name !== "Replay" && i.name !== "BrowserTracing"),

  // 환경성/반복 에러 필터 — Sentry 쿼터 보호
  ignoreErrors: [
    // Clerk prod key가 localhost/preview 도메인에서 반환하는 정상 거부
    "The Request HTTP Origin header must be equal to or a subdomain",
    // 브라우저 extension 유래 (우리 코드 아님)
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // 네트워크 취소 (사용자가 페이지 이탈)
    "AbortError",
    "The user aborted a request",
    // 광고 차단기 유래
    "Failed to fetch",
  ],

  // 민감 데이터 마스킹 + 빈 이벤트 드롭
  beforeSend(event: Sentry.ErrorEvent, hint) {
    if (process.env.NODE_ENV !== "production") return null

    if (event.request?.headers) {
      const headers = event.request.headers as Record<string, string>
      delete headers.cookie
      delete headers.Cookie
      delete headers.authorization
      delete headers.Authorization
    }

    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (/password|secret|token|apiKey/i.test(key)) {
          event.extra[key] = "[redacted]"
        }
      }
    }

    // exception message의 Bearer 토큰 패턴 마스킹
    const msg = hint?.originalException instanceof Error ? hint.originalException.message : ""
    if (/Bearer\s+[A-Za-z0-9._-]+/.test(msg) && event.exception?.values?.[0]?.value) {
      event.exception.values[0].value = event.exception.values[0].value.replace(
        /Bearer\s+[A-Za-z0-9._-]+/g,
        "Bearer [redacted]"
      )
    }

    return event
  },
})

// Replay는 첫 에러 발생 시 lazy-load
if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
  window.addEventListener(
    "error",
    () => {
      import("@sentry/nextjs").then(({ replayIntegration, getClient }) => {
        const client = getClient()
        if (client && !client.getIntegrationByName("Replay")) {
          client.addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }))
        }
      })
    },
    { once: true }
  )
}
