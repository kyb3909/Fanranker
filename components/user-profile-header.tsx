"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UserProfileBadge } from "@/components/user-profile-badge"
import { UserPlus, UserMinus } from "lucide-react"
import { useState, useEffect } from "react"

interface UserProfileHeaderProps {
  userId: string
  nickname: string
  avatarUrl?: string | null
  isExpert?: boolean
  temperature?: number
  currentUserId?: string | null // 현재 로그인한 사용자 ID (자신의 프로필인지 확인용)
  initialFollowing?: boolean // 초기 팔로우 상태
}

export function UserProfileHeader({
  userId,
  nickname,
  avatarUrl,
  isExpert,
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
      alert('로그인이 필요합니다.')
      return
    }

    setIsLoading(true)
    try {
      const action = isFollowing ? 'unfollow' : 'follow'
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '팔로우 처리에 실패했습니다.')
      }

      const { following } = await response.json()
      setIsFollowing(following)
    } catch (error) {
      console.error('Failed to toggle follow:', error)
      alert(error instanceof Error ? error.message : '팔로우 처리에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const getTemperatureColor = (temp: number) => {
    if (temp >= 80) return "text-red-500"
    if (temp >= 60) return "text-orange-500"
    if (temp >= 40) return "text-yellow-500"
    return "text-blue-500"
  }

  return (
    <div className="flex items-start justify-between p-4 sm:p-6 bg-card border-b border-border">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
          <AvatarImage src={avatarUrl || "/placeholder-user.jpg"} alt={nickname} />
          <AvatarFallback className="text-lg sm:text-xl font-semibold">
            {nickname[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{nickname}</h1>
            {isExpert && <UserProfileBadge isExpert={isExpert} size="md" />}
          </div>
          <div className={`flex items-center gap-1 text-sm ${getTemperatureColor(temperature)}`}>
            <span className="font-semibold">온도</span>
            <span className="font-bold">{temperature.toFixed(1)}°</span>
          </div>
        </div>
      </div>
      {!isOwnProfile && currentUserId && (
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
