"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Search, Ban, Pencil, Trash2, User, Flag } from "lucide-react"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUser } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"
import { TitleBadge } from "@/components/profile/title-badge"
import { ImageLightbox } from "@/components/ui/image-lightbox"
import { PostActions } from "./post-actions"
import { CommentSection } from "./comment-section"
import { openReport } from "@/hooks/use-report-dialog"
import type { Post } from "./post-detail-types"

const TipTapContent = dynamic(
  () =>
    import("@/components/editor/tiptap-content").then((mod) => ({ default: mod.TipTapContent })),
  { ssr: false, loading: () => <div className="bg-muted h-32 animate-pulse rounded" /> }
)

export type { Post }

export interface InitialCommentsData {
  comments: {
    id: string
    user_id: string
    parent_id: string | null
    content: string
    vote_count: number
    created_at: string
    sticker_id?: string | null
    stickers?: { id: string; name: string; image_url: string } | null
  }[]
  profiles: { user_id: string; nickname: string; avatar_url: string | null }[]
  equippedTitles: {
    user_id: string
    board_slug: string
    adj_titles: { title: string; rarity: string } | null
    noun_titles: { title: string } | null
  }[]
}

export function PostDetailContent({
  post,
  initialCommentsData,
}: {
  post: Post
  initialCommentsData?: InitialCommentsData
}) {
  const router = useRouter()
  const { user } = useUser()
  const isAuthor = post.userId === user?.id
  const [commentCount, setCommentCount] = useState(0)

  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count)
  }, [])

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(post.author)}&type=nickname`)
  }

  const handleBlockUser = async () => {
    if (!confirm(`${post.author}님을 차단하시겠습니까?`)) return
    try {
      const res = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: post.userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "차단에 실패했습니다.",
        })
        return
      }
      toast({
        title: data.blocked ? "차단 완료" : "차단 해제",
        description: data.blocked
          ? `${post.author}님을 차단했습니다.`
          : `${post.author}님 차단을 해제했습니다.`,
      })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "오류", description: "차단 중 오류가 발생했습니다." })
    }
  }

  const handleEditPost = () => {
    router.push(`/write?edit=${post.id}`)
  }

  const handleDeletePost = async () => {
    if (!confirm("이 글을 삭제하시겠습니까?")) return
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "삭제에 실패했습니다.",
        })
        return
      }
      router.push("/")
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "오류", description: "삭제 중 오류가 발생했습니다." })
    }
  }

  return (
    <div className="space-y-4">
      <ImageLightbox />
      {/* Post Detail Card */}
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: "var(--wc-card)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex shrink-0 cursor-pointer items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={post.avatar || "/placeholder.svg"} alt={post.author} />
                      <AvatarFallback>{post.author?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-foreground text-base font-semibold hover:underline">
                      {post.author}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {post.userId && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href={`/profile/${post.userId}`}>
                        <User className="mr-2 h-4 w-4" />
                        <span>프로필 보기</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                    <Search className="mr-2 h-4 w-4" />
                    <span>해당 아이디로 검색</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleBlockUser}
                    className="text-destructive cursor-pointer"
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    <span>차단하기</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {post.titleDisplay && (post.titleDisplay.adjTitle || post.titleDisplay.nounTitle) && (
                <TitleBadge
                  adjTitle={post.titleDisplay.adjTitle}
                  nounTitle={post.titleDisplay.nounTitle}
                  rarity={post.titleDisplay.rarity}
                  size="sm"
                />
              )}
              <span className="text-muted-foreground text-sm">{post.timestamp}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-full bg-transparent px-3 text-xs font-medium"
              >
                {post.community}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="더보기 메뉴">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isAuthor ? (
                    <>
                      <DropdownMenuItem onClick={handleEditPost} className="cursor-pointer">
                        <Pencil className="mr-2 h-4 w-4" />
                        수정
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDeletePost}
                        className="text-destructive cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      {post.userId && (
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/profile/${post.userId}`}>
                            <User className="mr-2 h-4 w-4" />
                            프로필 보기
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                        <Search className="mr-2 h-4 w-4" />
                        해당 아이디로 검색
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleBlockUser}
                        className="text-destructive cursor-pointer"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        차단하기
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openReport("post", String(post.id))}
                        className="text-destructive cursor-pointer"
                      >
                        <Flag className="mr-2 h-4 w-4" />
                        신고하기
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2
              className="leading-snug font-black tracking-tight text-pretty"
              style={{
                fontSize: "clamp(20px, 3.2vw, 26px)",
                color: "var(--wc-ink)",
                letterSpacing: "-0.02em",
              }}
            >
              {post.title}
            </h2>
            <div className="px-1 pt-3">
              {typeof post.content === "string" ? (
                <p className="text-foreground leading-relaxed">{post.content}</p>
              ) : (
                // TipTap JSON 렌더링 (임베드 포함)
                <TipTapContent content={post.content} />
              )}
            </div>
            {/* Image — 본문에 이미 포함된 이미지는 중복 표시하지 않음 */}
            {post.image &&
              (() => {
                // 본문 JSON을 문자열화하여 이미지 URL이 포함되어 있는지 확인
                if (typeof post.content !== "string") {
                  try {
                    const bodyStr = JSON.stringify(post.content)
                    if (bodyStr.includes(post.image)) return null
                  } catch {
                    // ignore
                  }
                }
                return (
                  <div className="post-body-image mt-2 inline-block max-w-[60%] cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-90">
                    <Image
                      src={post.image}
                      alt={`${post.title} 첨부 이미지`}
                      width={700}
                      height={700}
                      className="h-auto w-full object-contain"
                      sizes="(max-width: 640px) 60vw, 420px"
                    />
                  </div>
                )
              })()}
          </div>

          {/* Actions */}
          <PostActions
            postId={post.id}
            postTitle={post.title}
            initialUpvotes={post.upvotes}
            initialIsUpvoted={post.isUpvoted}
            commentCount={commentCount}
          />
        </div>
      </div>

      {/* Comments Section */}
      <CommentSection
        postId={post.id}
        onCommentCountChange={handleCommentCountChange}
        initialData={initialCommentsData}
      />
    </div>
  )
}
