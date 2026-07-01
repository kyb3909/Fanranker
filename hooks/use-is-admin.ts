"use client"

import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"

/**
 * 현재 유저가 운영자(profiles.role === "admin")인지 여부.
 * /api/profile/me 를 SWR로 조회(앱 전역에서 dedupe). 비로그인은 조회 안 함.
 * UI 노출 용도일 뿐 — 실제 권한은 서버가 강제한다.
 */
export function useIsAdmin(): boolean {
  const { isSignedIn } = useAuth()
  const { data } = useSWR<{ role?: string }>(isSignedIn ? "/api/profile/me" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
  return data?.role === "admin"
}
