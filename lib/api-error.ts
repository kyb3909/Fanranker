import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

/**
 * API 라우트에서 일관된 에러 응답 생성 + Sentry 자동 보고
 *
 * @example
 * catch (error) {
 *   return apiError('게시글 작성에 실패했습니다.', 500, error)
 * }
 */
export function apiError(message: string, status: number, error?: unknown) {
  if (error) {
    Sentry.captureException(error, {
      extra: { apiMessage: message, status },
    })
  }
  return NextResponse.json({ error: message }, { status })
}

/**
 * 400 Bad Request 헬퍼
 */
export function apiBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * 401 Unauthorized 헬퍼
 */
export function apiUnauthorized(message = "로그인이 필요합니다.") {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Rate limit 체크 — 초과 시 429 응답 반환, 통과 시 null
 *
 * IP 기반 + 선택적 userId 기반 이중 제한.
 * userId가 제공되면 userId:pathname 키로도 별도 제한을 건다.
 *
 * @example
 * const limited = checkRateLimit(request, "STRICT")
 * if (limited) return limited
 *
 * // With userId (authenticated routes)
 * const limited = checkRateLimit(request, "STRICT", user.id)
 * if (limited) return limited
 */
export function checkRateLimit(
  request: { headers: { get(name: string): string | null }; url?: string },
  preset: keyof typeof RATE_LIMITS = "STANDARD",
  userId?: string
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { limit, windowMs } = RATE_LIMITS[preset]
  const { success, remaining } = rateLimit(ip, limit, windowMs)
  if (!success) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(windowMs / 1000)),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    )
  }

  if (userId) {
    let pathname = ""
    try {
      pathname = request.url ? new URL(request.url).pathname : ""
    } catch { /* ignore */ }
    const userKey = `uid:${userId}:${pathname}`
    const userResult = rateLimit(userKey, limit, windowMs)
    if (!userResult.success) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(windowMs / 1000)),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(userResult.remaining),
          },
        }
      )
    }
  }

  return null
}
