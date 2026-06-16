"use client"

import { useState, useEffect } from "react"
import { Users } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"

/**
 * 게시판 [멤버 수 + 팔로우 버튼] 행. 팔로우 상태/토글은 자체 관리.
 * 크리에이터 보드 상단 채널 헤더에서 사용 (일반 보드는 CommunityContent 미니헤더가 담당).
 */
export function BoardFollow({
  communitySlug,
  members,
}: {
  communitySlug: string
  members?: string
}) {
  const { isSignedIn } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  useEffect(() => {
    if (!isSignedIn || !communitySlug) return
    fetch(`/api/community/${communitySlug}/follow`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setIsFollowing(data.following))
      .catch(() => {})
  }, [isSignedIn, communitySlug])

  const handleFollow = async () => {
    if (!isSignedIn) {
      toast({ variant: "destructive", title: "로그인 필요", description: "로그인이 필요합니다." })
      return
    }
    if (!communitySlug || isFollowLoading) return
    setIsFollowLoading(true)
    try {
      const method = isFollowing ? "DELETE" : "POST"
      const res = await fetch(`/api/community/${communitySlug}/follow`, { method })
      if (res.ok) {
        const data = await res.json()
        setIsFollowing(data.following)
      }
    } catch {
      // silent fail
    } finally {
      setIsFollowLoading(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      {members != null && (
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
          <Users className="h-3.5 w-3.5" />
          <span className="font-semibold tabular-nums">{members}</span>
        </div>
      )}
      <button
        type="button"
        onClick={handleFollow}
        disabled={isFollowLoading}
        className="shrink-0 rounded-md px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-60"
        style={{
          background: "var(--wc-card)",
          color: isFollowing ? "var(--wc-mute)" : "var(--wc-ink)",
          border: "1px solid var(--wc-line-2)",
          minHeight: 36,
        }}
      >
        {isFollowing ? "팔로잉" : "팔로우"}
      </button>
    </div>
  )
}
