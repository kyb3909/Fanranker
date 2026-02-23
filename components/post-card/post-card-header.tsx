"use client"

import { Button } from "@/components/ui/button"
import { MoreHorizontal, Search, Ban, Pencil, Trash2, Flag } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const BADGE_COLOR = { bg: "bg-primary/15", text: "text-foreground", border: "border-primary/30" }

export interface PostCardHeaderProps {
  community: string
  communityLink: string
  timestamp: string
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
  isAuthor,
  onEdit,
  onDelete,
  onSearchByAuthor,
  onBlockUser,
  onReport,
}: PostCardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {/* 커뮤니티 배지 - Teal 액센트 */}
        <Link href={`/community/${communityLink}`}>
          <span className={`text-[13px] font-medium px-2.5 py-1 rounded-md ${BADGE_COLOR.bg} ${BADGE_COLOR.text} border ${BADGE_COLOR.border} hover:opacity-80 transition-opacity`}>
            {community}
          </span>
        </Link>
      </div>

      {/* 우측: 시간 + 더보기 */}
      <div className="flex items-center gap-1">
        <span className="text-[13px] text-muted-foreground">{timestamp}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" aria-label="더보기 메뉴">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isAuthor ? (
              <>
                <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={onSearchByAuthor} className="cursor-pointer">
                  <Search className="mr-2 h-4 w-4" />
                  해당 아이디로 검색
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onBlockUser} className="cursor-pointer text-destructive">
                  <Ban className="mr-2 h-4 w-4" />
                  차단하기
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onReport} className="cursor-pointer text-destructive">
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
