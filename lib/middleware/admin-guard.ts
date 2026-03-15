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
    signInUrl.searchParams.set("redirect_url", req.url)
    return NextResponse.redirect(signInUrl)
  }

  return null
}
