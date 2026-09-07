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
import { onboardingGuard } from "@/lib/middleware/onboarding-guard"

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    // 1. Rate limiting for API routes
    const rateLimited = rateLimitGuard(req)
    if (rateLimited) return rateLimited

    // 2. Admin route protection
    const adminRedirect = await adminGuard(auth, req)
    if (adminRedirect) return adminRedirect

    // 3. Onboarding redirect for incomplete users
    const onboardingRedirect = await onboardingGuard(auth, req)
    if (onboardingRedirect) return onboardingRedirect

    // 4. 현재 경로를 헤더로 넘긴다 — 레이아웃(서버 컴포넌트)은 pathname 을 못 받는데,
    //    /admin 레이아웃이 역할별 경로 허용을 판정하려면 어느 화면인지 알아야 한다.
    //    (lib/admin/route-access.ts — 헤더가 없으면 거부하는 fail-closed 규칙)
    const headers = new Headers(req.headers)
    headers.set("x-pathname", req.nextUrl.pathname)
    return NextResponse.next({ request: { headers } })
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
    return NextResponse.next()
  }
})

export const config = {
  matcher: [
    "/((?!avatar-lab(?:/|$)|_next|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|glb|gltf|bin|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
