"use client"

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
import { User as UserIcon, FileText, Trophy, Coins, Settings, LogOut } from "lucide-react"
import Link from "next/link"

export function UserMenu() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  if (!isLoaded) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
        <div className="bg-muted h-9 w-9 animate-pulse rounded-full" />
      </Button>
    )
  }

  if (!user) {
    return null
  }

  const userInitials = user.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ""}`
    : user.emailAddresses[0]?.emailAddress[0].toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-muted/50 h-9 w-9 rounded-full transition-colors"
          aria-label="사용자 메뉴"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.imageUrl} alt={user.fullName || "사용자"} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
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
              <AvatarImage src={user.imageUrl} alt={user.fullName || "사용자"} />
              <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-semibold">
                {user.fullName || "사용자"}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {user.emailAddresses[0]?.emailAddress}
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

        <Link href="/payments">
          <DropdownMenuItem className="hover:bg-muted/50 cursor-pointer rounded-lg px-3 py-2.5 transition-colors">
            <Coins className="mr-3 h-4 w-4 text-amber-500" />
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
