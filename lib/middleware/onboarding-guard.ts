import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

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

/**
 * 온보딩 미완료 유저를 /sign-up으로 리다이렉트.
 * 쿠키로 24시간 캐싱하여 매 요청 DB 조회 방지.
 */
export async function onboardingGuard(
  auth: () => Promise<{ userId: string | null }>,
  req: NextRequest
): Promise<NextResponse | null> {
  if (isOnboardingExcluded(req.nextUrl.pathname)) return null

  const { userId } = await auth()
  if (!userId) return null

  const onboardingCookie = req.cookies.get("onboarding_done")
  if (onboardingCookie) return null

  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
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
      maxAge: 60 * 60 * 24,
    })
    return response
  } catch (onboardingError) {
    console.error("Onboarding check failed:", onboardingError)
    return NextResponse.redirect(new URL("/sign-up", req.url))
  }
}
