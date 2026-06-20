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

  // 완료 상태만 쿠키(positive cache, 24h)로 DB 재조회를 건너뛴다.
  //
  // 미완료(negative cache)는 캐싱하지 않는다. 과거엔 `onboarding_status=incomplete`
  // 쿠키가 있으면 DB 재조회 없이 곧장 /sign-up 으로 단락시켰는데, 온보딩 완료 직후
  // DB 는 완료지만 이 쿠키가 (동기화 실패·쿠키 path 불일치 등으로) 남으면
  // `/` → /sign-up → (이미 완료라) 빈 화면(null) → `/` … 무한 루프가 발생했다.
  // negative cache 를 없애 매 요청 DB 로 self-heal 한다. 미완료 유저는 어차피
  // /sign-up 으로 보내지므로 추가 DB 조회 비용은 무시할 수준이다.
  const onboardingCookie = req.cookies.get("onboarding_done")
  if (onboardingCookie) return null

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase env vars in onboarding guard")
      return null
    }
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .single()

    const isNewUser = !profile && profileError?.code === "PGRST116"
    const isOnboardingIncomplete = profile && profile.onboarding_completed === false

    if (isNewUser || isOnboardingIncomplete) {
      // negative cache 없이 매번 DB 로 판정 → 완료 즉시 루프 없이 통과.
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
