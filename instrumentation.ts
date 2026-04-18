import * as Sentry from "@sentry/nextjs"

function sanitizeEvent<T extends Sentry.ErrorEvent>(event: T): T | null {
  if (process.env.NODE_ENV !== "production") return null

  // request headers 마스킹
  if (event.request?.headers) {
    const headers = event.request.headers as Record<string, string>
    delete headers.cookie
    delete headers.Cookie
    delete headers.authorization
    delete headers.Authorization
    delete headers["x-supabase-auth"]
  }

  // extra에 secret 계열 키 마스킹
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (/password|secret|token|apiKey|service_role/i.test(key)) {
        event.extra[key] = "[redacted]"
      }
    }
  }

  return event
}

const BASE_CONFIG = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
  debug: false,
  ignoreErrors: [
    "JWT expired",
    "PGRST301", // RLS reject — expected when unauthorized
    "AbortError",
    "The user aborted a request",
  ],
  beforeSend: sanitizeEvent,
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(BASE_CONFIG)
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(BASE_CONFIG)
  }
}

export const onRequestError = Sentry.captureRequestError
