"use client"

import { useState, useEffect } from "react"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User as UserIcon, FileText, Trophy, Coins, Settings, LogOut, Sparkles } from "lucide-react"
import Link from "@/components/ui/app-link"

export function UserMenu() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [profileNickname, setProfileNickname] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !user) return
    fetch("/api/profile/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.avatar_url) setProfileAvatarUrl(data.avatar_url)
        if (data?.nickname) setProfileNickname(data.nickname)
      })
      .catch(() => {})
  }, [isLoaded, user])

  if (!isLoaded || !user) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="사용자 메뉴">
        <div className="bg-muted h-9 w-9 animate-pulse rounded-full" />
      </Button>
    )
  }

  const displayName = profileNickname || user.fullName || "사용자"
  const userInitials = profileNickname
    ? profileNickname[0]
    : user.firstName
      ? `${user.firstName[0]}${user.lastName?.[0] || ""}`
      : user.emailAddresses[0]?.emailAddress[0].toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-muted/50 h-10 w-10 rounded-full transition-colors"
          aria-label="사용자 메뉴"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={profileAvatarUrl || user.imageUrl} alt={displayName} />
            <AvatarFallback
              className="text-sm font-bold"
              style={{
                background: "rgba(160, 32, 59, 0.12)",
                color: "var(--wc-burgundy, #a0203b)",
              }}
            >
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="bg-card border-border mt-2 w-64 rounded-xl border p-2 shadow-lg"
      >
        {/* 사용자 정보 헤더 */}
        <div className="mb-1 px-3 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={profileAvatarUrl || user.imageUrl} alt={displayName} />
              <AvatarFallback
                className="text-base font-bold"
                style={{
                  background: "rgba(160, 32, 59, 0.12)",
                  color: "var(--wc-burgundy, #a0203b)",
                }}
              >
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: "var(--wc-ink, #1a1416)" }}>
                {displayName}
              </p>
              <p className="truncate text-xs" style={{ color: "var(--wc-mute, #7a6b65)" }}>
                {user.username || user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border" />

        {/* 메뉴 항목들 */}
        <Link href={`/profile/${user.id}`}>
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <UserIcon className="text-muted-foreground mr-3 h-4 w-4" />
            <span className="text-sm font-medium">내 프로필</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/my-posts">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <FileText className="text-muted-foreground mr-3 h-4 w-4" />
            <span className="text-sm font-medium">내 작성글</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/my-predictions">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <Trophy className="text-muted-foreground mr-3 h-4 w-4" />
            <span className="text-sm font-medium">승부예측 내역</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/shop">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <Sparkles className="mr-3 h-4 w-4" style={{ color: "var(--wc-burgundy, #a0203b)" }} />
            <span className="text-sm font-medium">상점</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/payments">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <Coins className="mr-3 h-4 w-4" style={{ color: "var(--wc-gold-deep, #b8941a)" }} />
            <span className="text-sm font-medium">골드 내역</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator className="bg-border" />

        <Link href="/settings">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <Settings className="text-muted-foreground mr-3 h-4 w-4" />
            <span className="text-sm font-medium">설정</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuItem
          onClick={() => signOut()}
          className="hover:bg-destructive/10 hover:text-destructive cursor-pointer rounded-lg px-3 py-2.5 transition-colors"
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span className="text-sm font-medium">로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
