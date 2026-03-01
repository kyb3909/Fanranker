"use client"

import { useState, useMemo } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { formatRelativeTime } from "@/lib/utils/date"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface Notification {
  id: string
  type: "comment" | "reply" | "new_post_by_followed" | "expert_prediction"
  actor_id: string
  related_post_id: string | null
  related_comment_id: string | null
  is_read: boolean
  created_at: string
}

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string | null
}

interface Post {
  id: string
  title: string
}

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // SWR로 읽지 않은 알림 개수 확인 (30초 자동 갱신, 중복 호출 방지)
  const { data: unreadData, mutate: mutateUnread } = useSWR(
    "/api/notifications?limit=1&unread_only=true",
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: false, dedupingInterval: 10000 }
  )
  const unreadCount = unreadData?.notifications?.length || 0

  async function loadNotifications() {
    setIsLoading(true)
    try {
      const response = await fetch("/api/notifications?limit=20")
      if (response.ok) {
        const {
          notifications: fetchedNotifications,
          profiles: fetchedProfiles,
          posts: fetchedPosts,
        } = await response.json()
        setNotifications(fetchedNotifications || [])
        setProfiles(fetchedProfiles || [])
        setPosts(fetchedPosts || [])
      } else {
        setNotifications([])
        setProfiles([])
        setPosts([])
      }
    } catch {
      setNotifications([])
      setProfiles([])
      setPosts([])
    } finally {
      setIsLoading(false)
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: notificationId }),
      })

      // 로컬 상태 업데이트
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      mutateUnread()
    } catch {
      // Silent fail - marking as read is non-critical
    }
  }

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles])
  const postMap = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])

  const getNotificationText = (notification: Notification) => {
    const actor = profileMap.get(notification.actor_id)
    const actorName = actor?.nickname || "익명"

    switch (notification.type) {
      case "comment":
        return `${actorName}님이 댓글을 남겼습니다`
      case "reply":
        return `${actorName}님이 답글을 남겼습니다`
      case "new_post_by_followed":
        return `${actorName}님이 새로운 글을 작성했습니다`
      case "expert_prediction":
        return `${actorName}님이 새로운 전문가 예측을 올렸습니다`
      default:
        return "새 알림이 있습니다"
    }
  }

  const getNotificationLink = (notification: Notification): string => {
    switch (notification.type) {
      case "comment":
      case "reply":
      case "new_post_by_followed":
        return notification.related_post_id ? `/post/${notification.related_post_id}` : "/"
      case "expert_prediction":
        // 전문가 예측 알림은 예측 페이지로 이동
        return "/games/prediction"
      default:
        return "/"
    }
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) loadNotifications()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : "알림"}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="bg-card border-border mt-2 w-80 overflow-hidden rounded-xl border p-0 shadow-lg"
      >
        <div className="border-border border-b p-4">
          <h3 className="text-foreground text-base font-semibold">알림</h3>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="text-muted-foreground mx-auto mb-2 h-6 w-6 animate-spin" />
              <p className="text-muted-foreground text-sm">알림을 불러오는 중...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm">알림이 없습니다</p>
            </div>
          ) : (
            <div className="divide-border divide-y">
              {notifications.map((notification) => {
                const actor = profileMap.get(notification.actor_id)
                const post = notification.related_post_id
                  ? postMap.get(notification.related_post_id)
                  : null

                return (
                  <Link
                    key={notification.id}
                    href={getNotificationLink(notification)}
                    onClick={() => {
                      if (!notification.is_read) {
                        markAsRead(notification.id)
                      }
                    }}
                    className="hover:bg-muted/50 block p-4 transition-colors"
                  >
                    <div className="flex gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage
                          src={actor?.avatar_url || "/placeholder-user.jpg"}
                          alt={actor?.nickname}
                        />
                        <AvatarFallback>{actor?.nickname?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${notification.is_read ? "text-muted-foreground" : "text-foreground font-medium"}`}
                        >
                          {getNotificationText(notification)}
                        </p>
                        {post && (
                          <p className="text-muted-foreground mt-1 truncate text-xs">
                            {post.title}
                          </p>
                        )}
                        <p className="text-muted-foreground mt-1 text-xs">
                          {formatRelativeTime(new Date(notification.created_at))}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <div className="bg-primary mt-2 h-2 w-2 flex-shrink-0 rounded-full" />
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
