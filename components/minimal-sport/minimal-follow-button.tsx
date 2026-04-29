"use client"

import { useState, useEffect } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { Check, Plus } from "lucide-react"

interface MinimalFollowButtonProps {
  communitySlug: string
}

/**
 * 게시판 follow 토글 — 미니멀 톤. /api/community/[slug]/follow GET/POST/DELETE.
 * 비로그인 시 클릭하면 Clerk 로그인 모달 열림.
 * 상태 변경 시 'communityFollowChanged' 이벤트 dispatch (HomeClient sidebar 동기화).
 */
export function MinimalFollowButton({ communitySlug }: MinimalFollowButtonProps) {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    fetch(`/api/community/${communitySlug}/follow`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setIsFollowing(data.following))
      .catch(() => {})
  }, [isSignedIn, communitySlug])

  const handleClick = async () => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    if (isLoading) return
    setIsLoading(true)
    try {
      const method = isFollowing ? "DELETE" : "POST"
      const res = await fetch(`/api/community/${communitySlug}/follow`, { method })
      if (res.ok) {
        const data = await res.json()
        setIsFollowing(data.following)
        window.dispatchEvent(new Event("communityFollowChanged"))
      }
    } catch {
      // silent fail
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className="flex h-9 items-center gap-1.5 rounded-full border px-4 text-[12px] font-bold transition-colors disabled:opacity-50"
      style={{
        backgroundColor: isFollowing ? "var(--ms-surface)" : "var(--ms-brand)",
        borderColor: isFollowing ? "var(--ms-line)" : "var(--ms-brand)",
        color: isFollowing ? "var(--ms-ink)" : "#ffffff",
      }}
      aria-pressed={isFollowing}
    >
      {isFollowing ? (
        <>
          <Check className="h-3.5 w-3.5" />
          팔로잉
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" />
          팔로우
        </>
      )}
    </button>
  )
}
