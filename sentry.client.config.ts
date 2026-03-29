import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
  // Replay는 에러 시에만 lazy-load하여 초기 번들 감소
  integrations: (integrations) => integrations.filter((i) => i.name !== "Replay"),
})

// Replay를 에러 발생 시에만 동적 로드
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
