"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Bell, BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { formatRelativeTime } from "@/lib/utils/date"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { usePushNotifications } from "@/hooks/use-push-notifications"

import type { Notification } from "@/types/notification"
import type { BaseProfile } from "@/types/user"

interface Post {
  id: string
  title: string
}

type Profile = BaseProfile

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // SWR로 읽지 않은 알림 개수 확인 (10초 자동 갱신)
  const { data: unreadData, mutate: mutateUnread } = useSWR(
    "/api/notifications?count_only=true",
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true, dedupingInterval: 5000 }
  )
  const unreadCount = unreadData?.unread_count || 0

  // 브라우저 푸시 알림
  const { permission, requestPermission, handleCountChange } = usePushNotifications()

  // 알림 개수 변경 시 브라우저 알림 트리거
  useEffect(() => {
    handleCountChange(unreadCount)
  }, [unreadCount, handleCountChange])

  // 최초 방문 시 알림 권한 요청 (조용히)
  useEffect(() => {
    if (permission === "default") {
      // 사용자가 사이트를 5초 이상 사용한 후 요청
      const timer = setTimeout(() => {
        requestPermission()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [permission, requestPermission])

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

  async function markAllAsRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      mutateUnread()
    } catch {
      // Silent fail
    }
  }

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles])
  const postMap = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])

  // 같은 글의 comment/reply 알림을 묶기
  interface GroupedNotification {
    notification: Notification
    count: number
    ids: string[]
  }

  const groupedNotifications = useMemo(() => {
    const groups: GroupedNotification[] = []
    const seen = new Map<string, number>() // key → index in groups

    for (const n of notifications) {
      // comment/reply만 묶기
      if ((n.type === "comment" || n.type === "reply") && n.related_post_id) {
        const key = `${n.type}:${n.related_post_id}`
        const existingIdx = seen.get(key)
        if (existingIdx !== undefined) {
          groups[existingIdx].count++
          groups[existingIdx].ids.push(n.id)
          // 읽지 않은 게 있으면 그룹도 미읽음
          if (!n.is_read)
            groups[existingIdx].notification = {
              ...groups[existingIdx].notification,
              is_read: false,
            }
          continue
        }
        seen.set(key, groups.length)
      }
      groups.push({ notification: n, count: 1, ids: [n.id] })
    }
    return groups
  }, [notifications])

  const getNotificationText = (group: GroupedNotification) => {
    const { notification, count } = group
    const actor = profileMap.get(notification.actor_id)
    const actorName = actor?.nickname || "익명"
    const post = notification.related_post_id ? postMap.get(notification.related_post_id) : null
    const postTitle = post?.title
      ? `"${post.title.slice(0, 20)}${post.title.length > 20 ? "..." : ""}"`
      : "게시글"

    switch (notification.type) {
      case "comment":
        if (count > 1) return `${postTitle}에 댓글이 ${count}개 달렸습니다`
        return `${actorName}님이 댓글을 남겼습니다`
      case "reply":
        if (count > 1) return `${postTitle}에 답글이 ${count}개 달렸습니다`
        return `${actorName}님이 답글을 남겼습니다`
      case "new_post_by_followed":
        return `${actorName}님이 새로운 글을 작성했습니다`
      case "expert_prediction":
        return `${actorName}님이 새로운 전문가 예측을 올렸습니다`
      case "settlement_result": {
        const meta = notification.metadata
        if (meta?.is_correct) {
          return `예측이 적중했습니다! +${meta.points_earned || 0}P`
        }
        return "아쉽게 빗나갔습니다"
      }
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
        return "/?tab=content"
      case "settlement_result":
        return "/my-predictions"
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
          {unreadCount > 0 ? (
            <BellRing className="h-[18px] w-[18px] animate-pulse" aria-hidden="true" />
          ) : (
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
          {unreadCount > 0 && (
            <span
              className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
              aria-hidden="true"
              style={{ background: "var(--wc-burgundy, #a0203b)" }}
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
        <div
          className="flex items-center justify-between p-4"
          style={{
            background: "var(--wc-soft, #f4ece6)",
            borderBottom: "1px solid var(--wc-line, #efe7e0)",
          }}
        >
          <h3
            className="text-[11px] font-bold uppercase"
            style={{
              color: "var(--wc-burgundy, #a0203b)",
              letterSpacing: "0.18em",
            }}
          >
            알림
          </h3>
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={markAllAsRead}
              className="text-xs font-bold"
              style={{ color: "var(--wc-burgundy, #a0203b)" }}
            >
              모두 읽음
            </button>
          )}
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
              {groupedNotifications.map((group) => {
                const notification = group.notification
                const actor = profileMap.get(notification.actor_id)
                const post = notification.related_post_id
                  ? postMap.get(notification.related_post_id)
                  : null

                return (
                  <Link
                    key={group.ids.join(",")}
                    href={getNotificationLink(notification)}
                    onClick={() => {
                      // 그룹의 모든 알림을 읽음 처리
                      for (const id of group.ids) {
                        const n = notifications.find((x) => x.id === id)
                        if (n && !n.is_read) markAsRead(id)
                      }
                    }}
                    className="hover:bg-muted/50 block p-4 transition-colors"
                  >
                    <div className="flex gap-3">
                      {notification.type === "settlement_result" ? (
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <span className="text-lg">
                            {notification.metadata?.is_correct ? "🎯" : "💫"}
                          </span>
                        </div>
                      ) : (
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage
                            src={actor?.avatar_url || "/placeholder-user.jpg"}
                            alt={actor?.nickname}
                          />
                          <AvatarFallback>{actor?.nickname?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${notification.is_read ? "text-muted-foreground" : "text-foreground font-medium"}`}
                        >
                          {getNotificationText(group)}
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
