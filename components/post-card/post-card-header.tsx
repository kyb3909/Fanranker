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
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {/* 커뮤니티 배지 */}
        <Link href={`/community/${communityLink}`}>
          <span
            className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${BADGE_COLOR.bg} ${BADGE_COLOR.text} border ${BADGE_COLOR.border} transition-opacity hover:opacity-80`}
          >
            {community}
          </span>
        </Link>
      </div>

      {/* 우측: 시간 + 더보기 */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-[13px]">{timestamp}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 min-w-[32px]"
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
                <DropdownMenuItem onClick={onSearchByAuthor} className="cursor-pointer">
                  <Search className="mr-2 h-4 w-4" />
                  해당 아이디로 검색
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onBlockUser} className="text-destructive cursor-pointer">
                  <Ban className="mr-2 h-4 w-4" />
                  차단하기
                </DropdownMenuItem>
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
