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

  const { data: profile, error } = useSWR(shouldCheck ? "/api/profile/me" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
    errorRetryCount: 0,
  })

  useEffect(() => {
    // API 에러 시 무시 (무한 루프 방지)
    if (!shouldCheck || error) return
    if (!profile) return

    // 500 에러 응답 무시 (error 필드가 있으면 실패)
    if (profile.error) return

    // user_id가 있는 정상 프로필인데 onboarding 미완료면 리다이렉트
    if (profile.user_id && profile.onboarding_completed === false) {
      router.replace("/sign-up")
    }

    // 빈 객체 (프로필 없음) → 리다이렉트
    if (!profile.user_id && !profile.error) {
      router.replace("/sign-up")
    }
  }, [shouldCheck, profile, error, router])
}
