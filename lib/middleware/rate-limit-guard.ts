import { NextRequest, NextResponse } from "next/server"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const STRICT_PATHS = [
  "/api/tokens/spend",
  "/api/payments/purchase",
  "/api/predictions/settle",
  "/api/upload/image",
  "/api/posts",
  "/api/votes",
  "/api/follow",
]

function isStrictPath(pathname: string): boolean {
  return STRICT_PATHS.some((p) => pathname.startsWith(p))
}

function isDeleteProfile(req: NextRequest): boolean {
  return req.nextUrl.pathname === "/api/profile/me" && req.method === "DELETE"
}

// 예측 제출 = 볼 차감 경로 (2026-08-08 감사: 유일하게 무방비였던 돈 라우트).
// POST 만 조인다 — GET 은 내 예측 조회라 일반 한도. 미들웨어는 rewrite 전 원본
// URL 을 보므로 클라이언트용 /api/sports 와 직접 호출용 /api/betman 둘 다 등재.
function isPredictionSubmit(req: NextRequest): boolean {
  return (
    req.method === "POST" &&
    (req.nextUrl.pathname === "/api/sports/prediction" ||
      req.nextUrl.pathname === "/api/betman/prediction")
  )
}

/**
 * API 요청 rate limiting.
 * 429 응답 반환 시 해당 NextResponse를 리턴, 통과 시 null.
 */
export function rateLimitGuard(req: NextRequest): NextResponse | null {
  if (!req.nextUrl.pathname.startsWith("/api/")) return null

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  const isStrict =
    isStrictPath(req.nextUrl.pathname) || isDeleteProfile(req) || isPredictionSubmit(req)
  const preset = isStrict ? RATE_LIMITS.STRICT : RATE_LIMITS.STANDARD
  const key = `${ip}:${req.nextUrl.pathname}`

  const result = rateLimit(key, preset.limit, preset.windowMs)

  if (!result.success) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(preset.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  return null
}
