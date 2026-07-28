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

/**
 * 서버 에러 진입점 — Sentry 캡처 + 디스코드 알림.
 *
 * Next.js 가 서버 컴포넌트·라우트 핸들러의 미처리 에러를 여기로 보낸다. 지금까지는
 * Sentry 로만 보냈는데, Sentry 는 열어봐야 알 수 있어서 사실상 사후 조사용이었다.
 * 개막 트래픽에서 뭔가 터지면 **그 순간 알아야** 하므로 디스코드로도 민다
 * (중복 억제·노이즈 필터는 lib/ops-error-alert.ts).
 */
export const onRequestError: typeof Sentry.captureRequestError = async (
  error,
  request,
  context
) => {
  Sentry.captureRequestError(error, request, context)
  // 알림은 요청 처리를 막지 않아야 하고, 실패해도 조용해야 한다
  const { alertServerError } = await import("@/lib/ops-error-alert")
  await alertServerError(error, {
    path: request?.path,
    kind: context?.routeType,
  })
}
