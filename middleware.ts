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
  } catch (error) {
    console.error("Middleware error:", error)
    return NextResponse.next()
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
