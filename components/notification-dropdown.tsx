'use client'

import { useState, useEffect, useMemo } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Notification {
  id: string
  type: 'comment' | 'reply' | 'new_post_by_followed' | 'expert_prediction'
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

// 상대적 시간 포맷팅
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  // 알림 로드
  useEffect(() => {
    if (isOpen) {
      loadNotifications()
    }
  }, [isOpen])

  // 주기적으로 읽지 않은 알림 개수 확인
  useEffect(() => {
    checkUnreadCount()
    const interval = setInterval(checkUnreadCount, 30000) // 30초마다 확인
    return () => clearInterval(interval)
  }, [])

  async function loadNotifications() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/notifications?limit=20')
      if (response.ok) {
        const { notifications: fetchedNotifications, profiles: fetchedProfiles, posts: fetchedPosts } = await response.json()
        setNotifications(fetchedNotifications || [])
        setProfiles(fetchedProfiles || [])
        setPosts(fetchedPosts || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        if (response.status !== 401) {
          console.error('Failed to load notifications:', response.status, errorData)
        }
        // 에러 발생 시 빈 배열로 설정
        setNotifications([])
        setProfiles([])
        setPosts([])
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
      // 네트워크 에러 등은 빈 배열로 설정
      setNotifications([])
      setProfiles([])
      setPosts([])
    } finally {
      setIsLoading(false)
    }
  }

  async function checkUnreadCount() {
    try {
      const response = await fetch('/api/notifications?limit=1&unread_only=true')
      if (response.ok) {
        const { notifications: fetchedNotifications } = await response.json()
        setUnreadCount(fetchedNotifications?.length || 0)
      } else {
        // 응답이 실패했지만 에러를 조용히 처리 (로그인하지 않은 경우 등)
        const errorData = await response.json().catch(() => ({}))
        if (response.status !== 401) {
          // 401 (Unauthorized)는 정상적인 경우이므로 로그하지 않음
          console.error('Failed to check unread count:', response.status, errorData)
        }
        setUnreadCount(0)
      }
    } catch (error) {
      // 네트워크 에러 등은 조용히 처리 (서버가 다운되었거나 네트워크 문제)
      console.error('Failed to check unread count:', error)
      setUnreadCount(0)
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId }),
      })
      
      // 로컬 상태 업데이트
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles])
  const postMap = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])

  const getNotificationText = (notification: Notification) => {
    const actor = profileMap.get(notification.actor_id)
    const actorName = actor?.nickname || '익명'

    switch (notification.type) {
      case 'comment':
        return `${actorName}님이 댓글을 남겼습니다`
      case 'reply':
        return `${actorName}님이 답글을 남겼습니다`
      case 'new_post_by_followed':
        return `${actorName}님이 새로운 글을 작성했습니다`
      case 'expert_prediction':
        return `${actorName}님이 새로운 전문가 예측을 올렸습니다`
      default:
        return '새 알림이 있습니다'
    }
  }

  const getNotificationLink = (notification: Notification): string => {
    switch (notification.type) {
      case 'comment':
      case 'reply':
      case 'new_post_by_followed':
        return notification.related_post_id ? `/post/${notification.related_post_id}` : '/'
      case 'expert_prediction':
        // 전문가 예측 알림은 예측 페이지로 이동
        return '/prediction'
      default:
        return '/'
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full relative"
          aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : "알림"}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute top-0 right-0 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0 mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden"
      >
        <div className="p-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">알림</h3>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">알림을 불러오는 중...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">알림이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const actor = profileMap.get(notification.actor_id)
                const post = notification.related_post_id ? postMap.get(notification.related_post_id) : null

                return (
                  <Link
                    key={notification.id}
                    href={getNotificationLink(notification)}
                    onClick={() => {
                      if (!notification.is_read) {
                        markAsRead(notification.id)
                      }
                    }}
                    className="block p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={actor?.avatar_url || '/placeholder-user.jpg'} alt={actor?.nickname} />
                        <AvatarFallback>{actor?.nickname?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${notification.is_read ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                          {getNotificationText(notification)}
                        </p>
                        {post && (
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {post.title}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(new Date(notification.created_at))}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
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
