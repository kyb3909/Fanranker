"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MoreHorizontal, Search, Ban, Pencil, Trash2, Flag, User } from "lucide-react"
import Link from "@/components/ui/app-link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TitleBadge, type TitleDisplay } from "@/components/profile/title-badge"
import { RelativeTime } from "@/components/ui/relative-time"

export interface PostCardHeaderProps {
  timestamp: string
  author: string
  avatar: string
  userId?: string
  titleDisplay?: TitleDisplay | null
  flairTitle?: string | null
  isAuthor: boolean
  onEdit: () => void
  onDelete: () => void
  onSearchByAuthor: () => void
  onBlockUser: () => void
  onReport: () => void
}

export function PostCardHeader({
  timestamp,
  author,
  avatar,
  userId,
  titleDisplay,
  flairTitle,
  isAuthor,
  onEdit,
  onDelete,
  onSearchByAuthor,
  onBlockUser,
  onReport,
}: PostCardHeaderProps) {
  const hasTitleBadge = titleDisplay && (titleDisplay.adjTitle || titleDisplay.nounTitle)

  return (
    <div className="mb-3 flex items-center gap-3">
      {/* 모바일 — 프로필 링크 */}
      <Link
        href={userId ? `/profile/${userId}` : "#"}
        className="flex shrink-0 items-center gap-3 sm:hidden"
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
          <AvatarFallback className="text-[11px]">{author?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-[13px] font-medium">{author}</p>
          <div className="flex items-center gap-1.5">
            {hasTitleBadge && (
              <>
                <TitleBadge
                  adjTitle={titleDisplay.adjTitle}
                  nounTitle={titleDisplay.nounTitle}
                  rarity={titleDisplay.rarity}
                  size="sm"
                />
                <span className="text-muted-foreground text-[11px]">·</span>
              </>
            )}
            {flairTitle && (
              <>
                <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                  {flairTitle}
                </span>
                <span className="text-muted-foreground text-[11px]">·</span>
              </>
            )}
            <RelativeTime date={timestamp} className="text-muted-foreground text-[11px]" />
          </div>
        </div>
      </Link>

      {/* 데스크톱 — 드롭다운 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hidden shrink-0 cursor-pointer items-center gap-3 sm:flex">
            <Avatar className="h-9 w-9">
              <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
              <AvatarFallback className="text-[11px]">{author?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="text-foreground text-[13px] font-medium hover:underline">{author}</p>
              <div className="flex items-center gap-1.5">
                {hasTitleBadge && (
                  <>
                    <TitleBadge
                      adjTitle={titleDisplay.adjTitle}
                      nounTitle={titleDisplay.nounTitle}
                      rarity={titleDisplay.rarity}
                      size="sm"
                    />
                    <span className="text-muted-foreground text-[11px]">·</span>
                  </>
                )}
                {flairTitle && (
                  <>
                    <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                      {flairTitle}
                    </span>
                    <span className="text-muted-foreground text-[11px]">·</span>
                  </>
                )}
                <RelativeTime date={timestamp} className="text-muted-foreground text-[11px]" />
              </div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {userId && (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href={`/profile/${userId}`}>
                <User className="mr-2 h-4 w-4" />
                <span>프로필 보기</span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onSearchByAuthor} className="cursor-pointer">
            <Search className="mr-2 h-4 w-4" />
            <span>해당 아이디로 검색</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onBlockUser} className="text-destructive cursor-pointer">
            <Ban className="mr-2 h-4 w-4" />
            <span>차단하기</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 더보기 메뉴 (데스크톱) */}
      <div className="ml-auto shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 min-w-[32px] sm:inline-flex"
              aria-label="더보기 메뉴"
            >
              <MoreHorizontal className="text-muted-foreground h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isAuthor ? (
              <>
                <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={onReport} className="text-destructive cursor-pointer">
                  <Flag className="mr-2 h-4 w-4" />
                  신고하기
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
