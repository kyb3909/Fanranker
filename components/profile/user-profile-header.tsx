"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UserProfileBadge } from "@/components/profile/user-profile-badge"
import { UserPlus, UserMinus, Newspaper } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"

interface UserProfileHeaderProps {
  userId: string
  nickname: string
  avatarUrl?: string | null
  isExpert?: boolean
  isJournalist?: boolean
  currentUserId?: string | null // 현재 로그인한 사용자 ID (자신의 프로필인지 확인용)
  initialFollowing?: boolean // 초기 팔로우 상태
}

export function UserProfileHeader({
  userId,
  nickname,
  avatarUrl,
  isExpert,
  isJournalist,
  currentUserId,
  initialFollowing = false,
}: UserProfileHeaderProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const isOwnProfile = currentUserId === userId

  useEffect(() => {
    setIsFollowing(initialFollowing)
  }, [initialFollowing])

  const handleFollow = async () => {
    if (!currentUserId) {
      toast({ variant: "destructive", title: "로그인 필요", description: "로그인이 필요합니다." })
      return
    }

    setIsLoading(true)
    try {
      const action = isFollowing ? "unfollow" : "follow"
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "팔로우 처리에 실패했습니다.")
      }

      const { following } = await response.json()
      setIsFollowing(following)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "팔로우 처리에 실패했습니다.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="h-[72px] w-[72px] shrink-0">
        <AvatarImage src={avatarUrl || "/placeholder-user.jpg"} alt={nickname} />
        <AvatarFallback
          className="text-xl font-extrabold"
          style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
        >
          {nickname[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-extrabold" style={{ fontSize: 20, color: "var(--wc-ink)" }}>
            {nickname}
          </h1>
          {isExpert && <UserProfileBadge isExpert={isExpert} size="md" />}
          {isJournalist && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <Newspaper className="h-3 w-3" />
              기자
            </span>
          )}
        </div>
      </div>
      {!isOwnProfile && currentUserId && isJournalist && (
        <Button
          variant={isFollowing ? "outline" : "default"}
          size="sm"
          onClick={handleFollow}
          disabled={isLoading}
          className="shrink-0 gap-2"
          style={
            isFollowing
              ? undefined
              : { background: "var(--wc-burgundy)", color: "#fff", border: "none" }
          }
        >
          {isFollowing ? (
            <>
              <UserMinus className="h-4 w-4" />
              <span>언팔로우</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              <span>팔로우</span>
            </>
          )}
        </Button>
      )}
    </div>
  )
}
