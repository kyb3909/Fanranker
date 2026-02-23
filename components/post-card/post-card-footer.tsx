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
  myVote: 'up' | 'down' | null
  comments: number
  isBookmarked: boolean
  onVote: (type: 'up' | 'down') => void
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
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
      {/* 좌측: 작성자 정보 */}
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
          <AvatarFallback className="text-[10px]">{author?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 text-[13px] font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
              {author}
              {authorTemperature != null && authorTemperature > 0 && (
                <span className="text-[12px] font-semibold tabular-nums" style={getTemperatureStyle(authorTemperature)}>
                  {authorTemperature.toFixed(1)}°
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={onSearchByAuthor} className="cursor-pointer">
              <Search className="mr-2 h-4 w-4" />
              <span>해당 아이디로 검색</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onBlockUser} className="cursor-pointer text-destructive">
              <Ban className="mr-2 h-4 w-4" />
              <span>차단하기</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 구분선 */}
        <span className="text-border">|</span>

        {/* 온도 */}
        <div className="flex items-center gap-0.5" style={getTemperatureStyle(temperature)}>
          <Thermometer className="h-3.5 w-3.5" />
          <span className="text-[12px] font-semibold tabular-nums">{temperature}°</span>
        </div>
      </div>

      {/* 우측: 액션 버튼 - 터치 타겟 최소 44px, 간격 8px 이상 */}
      <div className="flex items-center gap-1">
        {/* 추천/비추천 */}
        <div className="flex items-center rounded-md border border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 min-h-[36px] px-2.5 rounded-r-none ${myVote === 'up' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote('up')}
            aria-label="추천"
            aria-pressed={myVote === 'up'}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className={`text-[12px] font-semibold tabular-nums px-1.5 ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {voteCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-9 min-h-[36px] px-2.5 rounded-l-none ${myVote === 'down' ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote('down')}
            aria-label="비추천"
            aria-pressed={myVote === 'down'}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* 댓글 */}
        <Link href={`/post/${postId}`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 min-h-[36px] px-3 gap-1.5 rounded-md text-muted-foreground hover:text-foreground"
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
          <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} aria-hidden="true" />
        </Button>

        {/* 공유 */}
        <ShareMenu postId={postId} postTitle={postTitle} />
      </div>
    </div>
  )
}
