/**
 * Integrated Middleware: Clerk + Rate Limiting + Admin Guard + Onboarding
 *
 * @see https://clerk.com/docs/nextjs/getting-started/quickstart
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 */

import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { rateLimitGuard } from "@/lib/middleware/rate-limit-guard"
import { adminGuard } from "@/lib/middleware/admin-guard"
import { accountGuard } from "@/lib/middleware/account-guard"
import { onboardingGuard } from "@/lib/middleware/onboarding-guard"

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Every pass-through response carries the real path, including the first
  // visit that sets onboarding_done. Never trust an incoming x-pathname value.
  const headers = new Headers(req.headers)
  headers.set("x-pathname", req.nextUrl.pathname)
  const nextResponse = NextResponse.next({ request: { headers } })

  try {
    // 1. Rate limiting for API routes
    const rateLimited = rateLimitGuard(req)
    if (rateLimited) return rateLimited

    const accountResponse = await accountGuard(auth, req)
    if (accountResponse) return accountResponse

    // 2. Admin route protection
    const adminRedirect = await adminGuard(auth, req)
    if (adminRedirect) return adminRedirect

    // 3. Onboarding redirect for incomplete users
    const onboardingResponse = await onboardingGuard(auth, req, nextResponse)
    return onboardingResponse ?? nextResponse
  } catch (error) {
    console.error("Middleware error:", error)
    // 관리자 영역은 가드 예외 시 fail-closed — 예외를 틈탄 보호 우회를 막는다.
    // 그 외 경로는 가용성 우선으로 통과시킨다 (가드 일시 오류로 사이트 전체가
    // 막히지 않게).
    const path = req.nextUrl.pathname
    if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "일시적 오류로 요청을 처리할 수 없습니다." }, { status: 503 })
        : NextResponse.redirect(new URL("/", req.url))
    }
    return nextResponse
  }
})

export const config = {
  matcher: [
    "/((?!avatar-lab(?:/|$)|_next|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|glb|gltf|bin|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
