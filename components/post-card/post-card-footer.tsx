"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowUp, ArrowDown, MessageCircle, Thermometer, Bookmark, Search, Ban } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShareMenu } from "@/components/share-menu"
import { getTemperatureStyle } from "@/lib/temperature"

export interface PostCardFooterProps {
  postId: number | string
  postTitle: string
  author: string
  avatar: string
  authorTemperature?: number
  temperature: number
  voteCount: number
  myVote: "up" | "down" | null
  comments: number
  isBookmarked: boolean
  onVote: (type: "up" | "down") => void
  onBookmark: () => void
  onBookmarkHover: () => void
  onSearchByAuthor: () => void
  onBlockUser: () => void
}

export function PostCardFooter({
  postId,
  postTitle,
  author,
  avatar,
  authorTemperature,
  temperature,
  voteCount,
  myVote,
  comments,
  isBookmarked,
  onVote,
  onBookmark,
  onBookmarkHover,
  onSearchByAuthor,
  onBlockUser,
}: PostCardFooterProps) {
  return (
    <div className="border-border/50 mt-4 space-y-2.5 border-t pt-3">
      {/* 1행: 작성자 정보 */}
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
          <AvatarFallback className="text-[11px]">{author?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-foreground hover:text-primary flex cursor-pointer items-center gap-1 text-[13px] font-medium transition-colors">
              {author}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
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

        <span className="text-border">|</span>

        <div className="flex items-center gap-0.5" style={getTemperatureStyle(temperature)}>
          <Thermometer className="h-3.5 w-3.5" />
          <span className="text-[12px] font-semibold tabular-nums">{temperature}°</span>
        </div>
      </div>

      {/* 2행: 액션 버튼 */}
      <div className="flex items-center justify-between">
        {/* 추천/비추천 */}
        <div className="border-border/50 flex items-center rounded-md border">
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 min-h-[36px] rounded-r-none px-2.5 ${myVote === "up" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote("up")}
            aria-label="추천"
            aria-pressed={myVote === "up"}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span
            className={`px-1.5 text-[12px] font-semibold tabular-nums ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {voteCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 min-h-[36px] rounded-l-none px-2.5 ${myVote === "down" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote("down")}
            aria-label="비추천"
            aria-pressed={myVote === "down"}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {/* 댓글 */}
          <Link href={`/post/${postId}`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-9 min-h-[36px] gap-1.5 rounded-md px-3"
              aria-label={`댓글 ${comments}개`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              <span className="text-[12px] font-semibold tabular-nums">{comments}</span>
            </Button>
          </Link>

          {/* 북마크 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 min-w-[36px] ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={onBookmark}
            onMouseEnter={onBookmarkHover}
            onFocus={onBookmarkHover}
            aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
            aria-pressed={isBookmarked}
          >
            <Bookmark
              className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`}
              aria-hidden="true"
            />
          </Button>

          {/* 공유 */}
          <ShareMenu postId={postId} postTitle={postTitle} />
        </div>
      </div>
    </div>
  )
}
