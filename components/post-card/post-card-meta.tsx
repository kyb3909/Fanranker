"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ThumbsUp,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Search,
  Ban,
  Pencil,
  Trash2,
  Flag,
  User,
} from "lucide-react"
import Link from "@/components/ui/app-link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TitleBadge, type TitleDisplay } from "@/components/profile/title-badge"
import { RelativeTime } from "@/components/ui/relative-time"
import { ShareMenu } from "@/components/share-menu"
import { cn } from "@/lib/utils"

interface PostCardMetaProps {
  postId: number | string
  postTitle: string
  author: string
  avatar: string
  userId?: string
  titleDisplay?: TitleDisplay | null
  flairTitle?: string | null
  timestamp: string
  voteCount: number
  myVote: "up" | "down" | null
  comments: number
  isBookmarked: boolean
  isAuthor: boolean
  onVote: (type: "up" | "down") => void
  onBookmark: () => void
  onBookmarkHover: () => void
  onEdit: () => void
  onDelete: () => void
  onSearchByAuthor: () => void
  onBlockUser: () => void
  onReport: () => void
}

export function PostCardMeta({
  postId,
  postTitle,
  author,
  avatar,
  userId,
  titleDisplay,
  flairTitle,
  timestamp,
  voteCount,
  myVote,
  comments,
  isBookmarked,
  isAuthor,
  onVote,
  onBookmark,
  onBookmarkHover,
  onEdit,
  onDelete,
  onSearchByAuthor,
  onBlockUser,
  onReport,
}: PostCardMetaProps) {
  const hasTitleBadge = titleDisplay && (titleDisplay.adjTitle || titleDisplay.nounTitle)

  return (
    <div className="mt-3.5 flex items-center gap-2 text-[12px] text-neutral-500 dark:text-neutral-400">
      {/* 좌측: 아바타 + 작성자 + 호칭/플레어 + 시간 */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* 모바일 아바타 — 프로필로 직행 */}
        <Link
          href={userId ? `/profile/${userId}` : "#"}
          className="shrink-0 sm:hidden"
          aria-label={`${author} 프로필`}
        >
          <AvatarSm avatar={avatar} author={author} />
        </Link>
        {/* 데스크톱 아바타 — 드롭다운 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden shrink-0 cursor-pointer sm:block"
              aria-label={`${author} 메뉴`}
            >
              <AvatarSm avatar={avatar} author={author} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
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

        <span className="truncate font-bold" style={{ color: "var(--wc-ink)" }}>
          {author}
        </span>

        {hasTitleBadge && (
          <>
            <Hairline />
            <TitleBadge
              adjTitle={titleDisplay.adjTitle}
              nounTitle={titleDisplay.nounTitle}
              rarity={titleDisplay.rarity}
              size="sm"
            />
          </>
        )}

        {flairTitle && (
          <>
            <Hairline />
            <span className="hidden rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600 sm:inline">
              {flairTitle}
            </span>
          </>
        )}

        <Hairline />
        <span style={{ color: "var(--wc-mute-2, #a0938c)" }}>
          <RelativeTime date={timestamp} className="shrink-0" />
        </span>
      </div>

      {/* 우측: 투표 / 댓글 / 북마크 / 공유 / 더보기 */}
      <div className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => onVote("up")}
          aria-label={`추천 ${voteCount}개`}
          aria-pressed={myVote === "up"}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 transition-colors sm:min-h-0 sm:min-w-0 sm:py-1.5",
            myVote === "up"
              ? "text-primary"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800"
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", myVote === "up" && "fill-current")} />
          <span className="font-medium tabular-nums">{voteCount}</span>
        </button>

        <Link
          href={`/post/${postId}`}
          aria-label={`댓글 ${comments}개`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:min-h-0 sm:min-w-0 sm:py-1.5 dark:hover:bg-neutral-800"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">{comments}</span>
        </Link>

        <button
          type="button"
          onClick={onBookmark}
          onMouseEnter={onBookmarkHover}
          onFocus={onBookmarkHover}
          aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
          aria-pressed={isBookmarked}
          className={cn(
            "hidden min-h-11 min-w-11 items-center justify-center rounded-full px-2 transition-colors sm:inline-flex sm:min-h-0 sm:min-w-0 sm:py-1.5",
            isBookmarked
              ? "text-primary"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800"
          )}
        >
          <Bookmark className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")} />
        </button>

        <span className="hidden sm:inline">
          <ShareMenu postId={postId} postTitle={postTitle} />
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:min-h-0 sm:min-w-0 sm:py-1.5 dark:hover:bg-neutral-800"
              aria-label="더보기 메뉴"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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
              <DropdownMenuItem onClick={onReport} className="text-destructive cursor-pointer">
                <Flag className="mr-2 h-4 w-4" />
                신고하기
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function AvatarSm({ avatar, author }: { avatar: string; author: string }) {
  return (
    <Avatar className="h-5 w-5">
      <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
      <AvatarFallback className="text-[9px]">{author?.[0] ?? "?"}</AvatarFallback>
    </Avatar>
  )
}

function Hairline() {
  return (
    <span aria-hidden className="text-neutral-300 dark:text-neutral-600">
      ·
    </span>
  )
}
