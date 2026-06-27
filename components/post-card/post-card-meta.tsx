"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ThumbsUp,
  MessageCircle,
  Eye,
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
  viewCount?: number
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
  viewCount,
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
    <div
      className="flex items-center gap-3.5 text-[12.5px]"
      style={{
        color: "var(--wc-mute)",
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--wc-line)",
      }}
    >
      {/* 좌측: 아바타 + 작성자 + 호칭/플레어 + 시간 */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* 모바일 — 아바타+닉네임 클릭 시 프로필로 직행 */}
        <Link
          href={userId ? `/profile/${userId}` : "#"}
          className="flex min-w-0 items-center gap-1.5 sm:hidden"
          aria-label={`${author} 프로필`}
        >
          <AvatarSm avatar={avatar} author={author} />
          <span className="truncate font-bold" style={{ color: "var(--wc-ink)" }}>
            {author}
          </span>
        </Link>
        {/* 데스크톱 — 아바타+닉네임 클릭 시 작성자 메뉴 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden min-w-0 cursor-pointer items-center gap-1.5 sm:flex"
              aria-label={`${author} 메뉴`}
            >
              <AvatarSm avatar={avatar} author={author} />
              <span className="truncate font-bold" style={{ color: "var(--wc-ink)" }}>
                {author}
              </span>
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
            {!isAuthor && (
              <DropdownMenuItem onClick={onBlockUser} className="text-destructive cursor-pointer">
                <Ban className="mr-2 h-4 w-4" />
                <span>차단하기</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasTitleBadge && (
          <>
            <Hairline />
            <TitleBadge
              adjTitle={titleDisplay.adjTitle}
              nounTitle={titleDisplay.nounTitle}
              rarity={titleDisplay.rarity}
              size="sm"
              className="shrink-0 whitespace-nowrap"
            />
          </>
        )}

        {flairTitle && (
          <>
            <Hairline />
            <span
              className="hidden rounded px-1.5 py-px text-[10px] font-semibold sm:inline"
              style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
            >
              {flairTitle}
            </span>
          </>
        )}

        <Hairline />
        <span className="shrink-0" style={{ color: "var(--wc-mute-2, #8B93A0)" }}>
          <RelativeTime date={timestamp} />
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
              : "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-burgundy)]"
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", myVote === "up" && "fill-current")} />
          <span className="font-medium tabular-nums">{voteCount}</span>
        </button>

        <Link
          href={`/post/${postId}`}
          aria-label={`댓글 ${comments}개`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 transition-colors hover:bg-[var(--wc-soft)] hover:text-[var(--wc-burgundy)] sm:min-h-0 sm:min-w-0 sm:py-1.5"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">{comments}</span>
        </Link>

        {/* 조회수 — 비상호작용 표시 (날짜·추천·댓글 다음) */}
        <span
          className="inline-flex items-center gap-1 px-2"
          aria-label={`조회 ${viewCount ?? 0}회`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">{viewCount ?? 0}</span>
        </span>

        {/* 데스크톱: hover/focus 시 노출 — 모바일: 상시 노출 */}
        <div className="flex items-center sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
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
                : "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-burgundy)]"
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
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 transition-colors hover:bg-[var(--wc-soft)] hover:text-[var(--wc-burgundy)] sm:min-h-0 sm:min-w-0 sm:py-1.5"
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
    </div>
  )
}

function AvatarSm({ avatar, author }: { avatar: string; author: string }) {
  return (
    <Avatar className="h-[26px] w-[26px]">
      <AvatarImage src={avatar || "/placeholder.svg"} alt={author} />
      <AvatarFallback className="text-[11px]" style={{ background: "#eceef2", color: "#961E37" }}>
        {author?.[0] ?? "?"}
      </AvatarFallback>
    </Avatar>
  )
}

function Hairline() {
  return (
    <span aria-hidden style={{ color: "var(--wc-line-2, #cfd4dc)" }}>
      ·
    </span>
  )
}
