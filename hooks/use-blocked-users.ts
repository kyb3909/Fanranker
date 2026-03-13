import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"
import { useCallback } from "react"

export function useBlockedUsers() {
  const { isSignedIn } = useAuth()

  const { data, mutate } = useSWR<{
    blocks: { blocked_id: string; created_at: string }[]
    profiles: { user_id: string; nickname: string; avatar_url: string | null }[]
  }>(isSignedIn ? "/api/users/block" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })

  const blockedIds = new Set((data?.blocks || []).map((b) => b.blocked_id))

  const toggleBlock = useCallback(
    async (userId: string) => {
      const res = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        mutate()
      }
      return res.ok ? await res.json() : null
    },
    [mutate]
  )

  const isBlocked = useCallback((userId: string) => blockedIds.has(userId), [blockedIds])

  return { blockedIds, isBlocked, toggleBlock, blockedProfiles: data?.profiles || [] }
}
