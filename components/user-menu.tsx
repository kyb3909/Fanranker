'use client'

import { useUser, useClerk } from '@clerk/nextjs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  User as UserIcon,
  FileText,
  Trophy,
  CreditCard,
  Settings,
  LogOut
} from 'lucide-react'
import Link from 'next/link'

export function UserMenu() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  if (!isLoaded) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
        <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
      </Button>
    )
  }

  if (!user) {
    return null
  }

  const userInitials = user.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ''}`
    : user.emailAddresses[0]?.emailAddress[0].toUpperCase() || 'U'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full hover:bg-muted/50 transition-colors"
          aria-label="사용자 메뉴"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.imageUrl} alt={user.fullName || '사용자'} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-64 p-2 mt-2 bg-card border border-border shadow-lg rounded-xl"
      >
        {/* 사용자 정보 헤더 */}
        <div className="px-3 py-3 mb-1">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.imageUrl} alt={user.fullName || '사용자'} />
              <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {user.fullName || '사용자'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border" />

        {/* 메뉴 항목들 */}
        <Link href={`/profile/${user.id}`}>
          <DropdownMenuItem className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
            <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">내 프로필</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/my-posts">
          <DropdownMenuItem className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
            <FileText className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">내 작성글</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/my-predictions">
          <DropdownMenuItem className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
            <Trophy className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">승부예측 내역</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/payments">
          <DropdownMenuItem className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
            <CreditCard className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">결제 내역</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator className="bg-border" />

        <Link href="/settings">
          <DropdownMenuItem className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
            <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">설정</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuItem
          onClick={() => signOut()}
          className="px-3 py-2.5 cursor-pointer rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span className="text-sm font-medium">로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
