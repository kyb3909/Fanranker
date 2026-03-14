"use client"

import { useAuth } from "@clerk/nextjs"
import { useRouter, usePathname } from "next/navigation"
import useSWR from "swr"
import { useEffect } from "react"
import { fetcher } from "@/lib/swr"

const EXCLUDED_PATHS = [
  "/sign-up",
  "/sign-in",
  "/sso-callback",
  "/terms",
  "/privacy",
  "/content-policy",
]

/**
 * 로그인된 유저가 온보딩 미완료 시 /sign-up으로 리다이렉트
 * 미들웨어 체크의 클라이언트 사이드 보완
 */
export function useOnboardingGuard() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const shouldCheck = isLoaded && isSignedIn && !EXCLUDED_PATHS.some((p) => pathname.startsWith(p))

  const { data: profile } = useSWR(shouldCheck ? "/api/profile/me" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  })

  useEffect(() => {
    if (!shouldCheck || !profile) return

    // 프로필이 빈 객체이거나 onboarding_completed가 false면 온보딩으로
    const hasProfile = profile && Object.keys(profile).length > 0
    if (!hasProfile || profile.onboarding_completed === false) {
      router.replace("/sign-up")
    }
  }, [shouldCheck, profile, router])
}
