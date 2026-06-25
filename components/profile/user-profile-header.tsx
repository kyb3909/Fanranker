"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileBadge } from "@/components/profile/user-profile-badge"
import { Newspaper } from "lucide-react"

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
  nickname,
  avatarUrl,
  isExpert,
  isJournalist,
}: UserProfileHeaderProps) {
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
      {/* 팔로우 기능 비활성 — 기자 도입 후 복원 예정 (프로필 팔로우 버튼 제거) */}
    </div>
  )
}
