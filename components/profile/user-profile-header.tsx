"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UserProfileBadge } from "@/components/profile/user-profile-badge"
import { UserPlus, UserMinus, Newspaper } from "lucide-react"
import { useState, useEffect } from "react"
import { getTemperatureStyle } from "@/lib/temperature"

interface UserProfileHeaderProps {
  userId: string
  nickname: string
  avatarUrl?: string | null
  isExpert?: boolean
  isJournalist?: boolean
  temperature?: number
  currentUserId?: string | null // 현재 로그인한 사용자 ID (자신의 프로필인지 확인용)
  initialFollowing?: boolean // 초기 팔로우 상태
}

export function UserProfileHeader({
  userId,
  nickname,
  avatarUrl,
  isExpert,
  isJournalist,
  temperature = 36.5,
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
      alert("로그인이 필요합니다.")
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
      alert(error instanceof Error ? error.message : "팔로우 처리에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-card border-border flex items-start justify-between border-b p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
          <AvatarImage src={avatarUrl || "/placeholder-user.jpg"} alt={nickname} />
          <AvatarFallback className="text-lg font-semibold sm:text-xl">
            {nickname[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-xl font-bold sm:text-2xl">{nickname}</h1>
            {isExpert && <UserProfileBadge isExpert={isExpert} size="md" />}
            {isJournalist && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Newspaper className="h-3 w-3" />
                기자
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm" style={getTemperatureStyle(temperature)}>
            <span className="font-semibold">온도</span>
            <span className="font-bold">{temperature.toFixed(1)}°</span>
          </div>
        </div>
      </div>
      {!isOwnProfile && currentUserId && isJournalist && (
        <Button
          variant={isFollowing ? "outline" : "default"}
          size="sm"
          onClick={handleFollow}
          disabled={isLoading}
          className="gap-2"
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
