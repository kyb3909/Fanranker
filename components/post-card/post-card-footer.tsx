"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowUp, ArrowDown, MessageCircle, Bookmark, Search, Ban, User, Flame } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShareMenu } from "@/components/share-menu"
import { TitleBadge, type TitleDisplay } from "@/components/profile/title-badge"

function getTemperatureColor(temp: number) {
  if (temp >= 80) return "text-red-500"
  if (temp >= 60) return "text-orange-500"
  if (temp >= 40) return "text-amber-500"
  if (temp >= 20) return "text-blue-500"
  return "text-slate-400"
}

export interface PostCardFooterProps {
  postId: number | string
  postTitle: string
  author: string
  avatar: string
  userId?: string
  voteCount: number
  myVote: "up" | "down" | null
  comments: number
  temperature?: number
  isBookmarked: boolean
  onVote: (type: "up" | "down") => void
  onBookmark: () => void
  onBookmarkHover: () => void
  titleDisplay?: TitleDisplay | null
  onSearchByAuthor: () => void
  onBlockUser: () => void
}

export function PostCardFooter({
  postId,
  postTitle,
  author,
  avatar,
  userId,
  voteCount,
  myVote,
  comments,
  temperature,
  isBookmarked,
  onVote,
  onBookmark,
  onBookmarkHover,
  titleDisplay,
  onSearchByAuthor,
  onBlockUser,
}: PostCardFooterProps) {
  return (
    <div className="border-border/50 mt-4 space-y-3 border-t pt-3">
      {/* 상단: 액션 버튼 (투표 · 댓글 · 온도 · 북마크 · 공유) */}
      <div className="flex items-center gap-1">
        {/* 투표 */}
        <div className="border-border/50 flex items-center rounded-full border">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 min-h-[32px] rounded-l-full rounded-r-none px-2.5 ${myVote === "up" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote("up")}
            aria-label="추천"
            aria-pressed={myVote === "up"}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span
            className={`min-w-[24px] text-center text-[12px] font-semibold tabular-nums ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {voteCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 min-h-[32px] rounded-l-none rounded-r-full px-2.5 ${myVote === "down" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => onVote("down")}
            aria-label="비추천"
            aria-pressed={myVote === "down"}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* 댓글 */}
        <Link href={`/post/${postId}`}>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 min-h-[32px] gap-1.5 rounded-full px-3"
            aria-label={`댓글 ${comments}개`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-[12px] font-semibold tabular-nums">{comments}</span>
          </Button>
        </Link>

        {/* 게시물 온도 */}
        {temperature != null && temperature > 0 && (
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tabular-nums ${getTemperatureColor(temperature)}`}
            title="게시물 온도"
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {temperature.toFixed(0)}°
          </div>
        )}

        {/* 우측 정렬: 북마크 + 공유 */}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 min-w-[32px] rounded-full ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
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
          <ShareMenu postId={postId} postTitle={postTitle} />
        </div>
      </div>

      {/* 하단: 작성자 정보 */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex shrink-0 cursor-pointer items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
                <AvatarFallback className="text-[10px]">{author?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground text-[13px] font-medium hover:underline">
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
        {titleDisplay && (titleDisplay.adjTitle || titleDisplay.nounTitle) && (
          <TitleBadge
            adjTitle={titleDisplay.adjTitle}
            nounTitle={titleDisplay.nounTitle}
            rarity={titleDisplay.rarity}
            size="sm"
          />
        )}
      </div>
    </div>
  )
}
