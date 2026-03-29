"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MoreHorizontal, Search, Ban, Pencil, Trash2, Flag, User } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TitleBadge, type TitleDisplay } from "@/components/profile/title-badge"

const BADGE_COLOR = { bg: "bg-primary/15", text: "text-foreground", border: "border-primary/30" }

export interface PostCardHeaderProps {
  community: string
  communityLink: string
  timestamp: string
  author: string
  avatar: string
  userId?: string
  titleDisplay?: TitleDisplay | null
  isAuthor: boolean
  onEdit: () => void
  onDelete: () => void
  onSearchByAuthor: () => void
  onBlockUser: () => void
  onReport: () => void
}

export function PostCardHeader({
  community,
  communityLink,
  timestamp,
  author,
  avatar,
  userId,
  titleDisplay,
  isAuthor,
  onEdit,
  onDelete,
  onSearchByAuthor,
  onBlockUser,
  onReport,
}: PostCardHeaderProps) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {/* 프사 + 닉네임: 모바일은 프로필 링크, 데스크톱은 드롭다운 */}
      {/* 모바일 — 터치 시 프로필로 바로 이동 (드롭다운으로 스크롤 차단 방지) */}
      <Link
        href={userId ? `/profile/${userId}` : "#"}
        className="flex shrink-0 items-center gap-2 sm:hidden"
      >
        <Avatar className="h-7 w-7">
          <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
          <AvatarFallback className="text-[11px]">{author?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <span className="text-foreground text-[14px] font-semibold">{author}</span>
      </Link>

      {/* 데스크톱 — 기존 드롭다운 유지 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hidden shrink-0 cursor-pointer items-center gap-2 sm:flex">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
              <AvatarFallback className="text-[11px]">{author?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <span className="text-foreground text-[14px] font-semibold hover:underline">
              {author}
            </span>
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

      {/* 칭호 */}
      {titleDisplay && (titleDisplay.adjTitle || titleDisplay.nounTitle) && (
        <TitleBadge
          adjTitle={titleDisplay.adjTitle}
          nounTitle={titleDisplay.nounTitle}
          rarity={titleDisplay.rarity}
          size="sm"
        />
      )}

      {/* 게시판 배지 */}
      <Link href={`/community/${communityLink}`}>
        <span
          className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ${BADGE_COLOR.bg} ${BADGE_COLOR.text} border ${BADGE_COLOR.border} transition-opacity hover:opacity-80`}
        >
          {community}
        </span>
      </Link>

      {/* 우측: 시간 + 더보기 (더보기는 데스크톱만, 모바일은 상세에서) */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className="text-muted-foreground text-[12px]">{timestamp}</span>
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
