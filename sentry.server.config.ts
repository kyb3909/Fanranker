import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // 서버 사이드 트레이싱 (5%)
  tracesSampleRate: 0.05,

  debug: false,
})
