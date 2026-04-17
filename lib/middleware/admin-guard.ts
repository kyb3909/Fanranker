import { NextRequest, NextResponse } from "next/server"
import { createRouteMatcher } from "@clerk/nextjs/server"

const isAdminRoute = createRouteMatcher(["/admin(.*)"])

/**
 * Admin 페이지 보호. 미인증 시 sign-up으로 리다이렉트.
 * API 라우트는 제외 (각 API에서 별도 인증).
 */
export async function adminGuard(
  auth: () => Promise<{ userId: string | null }>,
  req: NextRequest
): Promise<NextResponse | null> {
  if (!isAdminRoute(req) || req.nextUrl.pathname.startsWith("/api")) return null

  const { userId } = await auth()
  if (!userId) {
    const signInUrl = new URL("/sign-up", req.url)
    // Open redirect 방지: 내부 /admin 경로만 허용. 외부 URL / 외부 path는 기본값으로 대체.
    const pathname = req.nextUrl.pathname
    const search = req.nextUrl.search
    const safeRedirect = pathname.startsWith("/admin") ? `${pathname}${search}` : "/admin"
    signInUrl.searchParams.set("redirect_url", safeRedirect)
    return NextResponse.redirect(signInUrl)
  }

  return null
}
