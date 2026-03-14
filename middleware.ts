/**
 * Integrated Middleware: Clerk + Supabase (Third-Party Auth)
 *
 * This middleware handles authentication for Clerk only.
 * Supabase uses Clerk as Third-Party Auth provider, so we don't need
 * to handle Supabase's own OAuth flow in middleware.
 *
 * Key responsibilities:
 * 1. Clerk authentication via clerkMiddleware()
 * 2. Route protection (optional)
 *
 * Note: Supabase authentication is handled via Clerk tokens in the client/server code,
 * not through Supabase's own OAuth flow. This prevents OAuth errors.
 *
 * @see https://clerk.com/docs/nextjs/getting-started/quickstart
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Define protected routes
const isAdminRoute = createRouteMatcher(["/admin(.*)"])

// Paths excluded from onboarding redirect
const ONBOARDING_EXCLUDED = [
  "/onboarding",
  "/api/",
  "/sign-up",
  "/sign-in",
  "/sso-callback",
  "/terms",
  "/privacy",
  "/content-policy",
  "/_next/",
  "/favicon.ico",
  "/design-demo",
]

function isOnboardingExcluded(pathname: string): boolean {
  return ONBOARDING_EXCLUDED.some((p) => pathname.startsWith(p))
}

// Sensitive endpoints that need strict rate limiting
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

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    // Rate limiting for API routes
    if (req.nextUrl.pathname.startsWith("/api/")) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown"

      const isStrict = isStrictPath(req.nextUrl.pathname) || isDeleteProfile(req)
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
    }

    // Protect admin routes - require authentication (페이지 라우트만)
    if (isAdminRoute(req) && !req.nextUrl.pathname.startsWith("/api")) {
      const { userId } = await auth()

      if (!userId) {
        const signInUrl = new URL("/sign-up", req.url)
        signInUrl.searchParams.set("redirect_url", req.url)
        return NextResponse.redirect(signInUrl)
      }
    }

    // Onboarding redirect: logged in + onboarding not completed → /sign-up
    // 쿠키에 캐싱하여 매 요청마다 Supabase 쿼리 방지
    if (!isOnboardingExcluded(req.nextUrl.pathname)) {
      const { userId } = await auth()

      if (userId) {
        const onboardingCookie = req.cookies.get("onboarding_done")

        // 쿠키가 있으면 Supabase 쿼리 스킵
        if (!onboardingCookie) {
          try {
            // Service Role 키로 RLS 우회하여 확실하게 프로필 조회
            const supabase = createSupabaseClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false,
                },
              }
            )

            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("onboarding_completed")
              .eq("user_id", userId)
              .single()

            const isNewUser = !profile && profileError?.code === "PGRST116"
            const isOnboardingIncomplete = profile && profile.onboarding_completed === false

            if (isNewUser || isOnboardingIncomplete) {
              return NextResponse.redirect(new URL("/sign-up", req.url))
            }

            // 온보딩 완료 확인됨 → 쿠키에 캐싱 (24시간)
            const response = NextResponse.next()
            response.cookies.set("onboarding_done", "1", {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 60 * 60 * 24, // 24h
            })
            return response
          } catch (onboardingError) {
            // Supabase 연결 실패 시에도 신규 유저일 수 있으므로 온보딩으로 보냄
            console.error("Onboarding check failed:", onboardingError)
            return NextResponse.redirect(new URL("/sign-up", req.url))
          }
        }
      }
    }
  } catch (error) {
    console.error("Middleware error:", error)
    return NextResponse.next()
  }
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, etc.
     * - API routes (trpc)
     */
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
