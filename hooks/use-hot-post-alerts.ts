"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface HotPostAlert {
  id: string
  community_slug: string | null
  community_name: string
  title: string
  temperature: number
  created_at: string
}

const SEEN_KEY = "seenHotPosts"
const MUTE_KEY = "hotToastMutedUntil"
const MUTE_MS = 30 * 60 * 1000 // 30분
const POLL_INTERVAL = 30_000 // 30초
const TOAST_DURATION = 8_000 // 8초

function getSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function addSeenId(id: string): void {
  if (typeof window === "undefined") return
  try {
    const set = getSeenIds()
    set.add(id)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set]))
  } catch {
    // ignore storage errors
  }
}

function getMuted(): boolean {
  if (typeof window === "undefined") return false
  try {
    const until = localStorage.getItem(MUTE_KEY)
    if (!until) return false
    return new Date(until) > new Date()
  } catch {
    return false
  }
}

/**
 * 실시간 인기글 토스트 훅.
 *
 * - 30초마다 /api/posts/hot-alerts 폴링
 * - 세션에서 본 적 없는 새 인기글 감지 시 currentToast 세팅
 * - 8초 후 자동 닫힘
 * - dismiss(): 즉시 닫기
 * - mute30Min(): 30분간 이 세션의 토스트 비활성 (localStorage)
 */
export function useHotPostAlerts({
  enabled,
  followedSlugs,
}: {
  enabled: boolean
  followedSlugs: string[]
}) {
  const [toast, setToast] = useState<HotPostAlert | null>(null)
  const [muted, setMuted] = useState<boolean>(getMuted)
  const mountedAt = useRef<string>(new Date().toISOString())
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = enabled && !muted
  const followsKey = followedSlugs.slice().sort().join(",")

  const swrKey = active
    ? `/api/posts/hot-alerts?since=${encodeURIComponent(mountedAt.current)}${
        followsKey ? `&follows=${followsKey}` : ""
      }`
    : null

  const { data } = useSWR<{ posts: HotPostAlert[] }>(swrKey, fetcher, {
    refreshInterval: POLL_INTERVAL,
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    errorRetryCount: 2,
  })

  useEffect(() => {
    if (!data?.posts || data.posts.length === 0) return
    if (!active) return

    const seen = getSeenIds()
    // 가장 hot한(상위 반환) 글 중 안 본 첫 번째.
    const fresh = data.posts.find((p) => !seen.has(p.id))
    if (!fresh) return

    setToast(fresh)
    addSeenId(fresh.id)

    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setToast((cur) => (cur?.id === fresh.id ? null : cur))
    }, TOAST_DURATION)
  }, [data, active])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const dismiss = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setToast(null)
  }

  const mute30Min = () => {
    try {
      localStorage.setItem(MUTE_KEY, new Date(Date.now() + MUTE_MS).toISOString())
    } catch {
      // ignore
    }
    setMuted(true)
    dismiss()
  }

  return { toast, dismiss, mute30Min }
}
