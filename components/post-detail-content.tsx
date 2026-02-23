"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { MoreHorizontal, Thermometer, Search, Ban, Pencil, Trash2 } from "lucide-react"
import Image from "next/image"
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { extractEmbedsFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { EmbedPreviewCard } from "@/components/embed-preview-card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUser } from "@clerk/nextjs"
import { getTemperatureStyle } from "@/lib/temperature"
import { PostActions } from "./post-detail/post-actions"
import { CommentSection } from "./post-detail/comment-section"
import type { Post } from "./post-detail/post-detail-types"

const TipTapContent = dynamic(
  () => import("@/components/tiptap-content").then(mod => ({ default: mod.TipTapContent })),
  { ssr: false, loading: () => <div className="h-32 bg-muted animate-pulse rounded" /> }
)

export type { Post }

export function PostDetailContent({ post }: { post: Post }) {
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

  const handleBlockUser = () => {
    if (confirm(`${post.author}님을 차단하시겠습니까?`)) {
      alert('차단 기능은 준비 중입니다.')
    }
  }

  const handleEditPost = () => {
    router.push(`/write?edit=${post.id}`)
  }

  const handleDeletePost = async () => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '삭제에 실패했습니다.')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const temperature = post.temperature ?? Math.min(100, Math.floor((post.upvotes * 2 + post.comments * 3) / 10))

  return (
    <div className="space-y-4">
      {/* Post Detail Card */}
      <Card className="overflow-hidden border border-border bg-card">
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={post.avatar || "/placeholder.svg"} alt={post.author} />
                <AvatarFallback>{post.author?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-base font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">
                        {post.author}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                        <Search className="mr-2 h-4 w-4" />
                        <span>해당 아이디로 검색</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleBlockUser} className="cursor-pointer text-destructive">
                        <Ban className="mr-2 h-4 w-4" />
                        <span>차단하기</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-sm text-muted-foreground">{post.timestamp}</span>
                  <div className="flex items-center gap-1" style={getTemperatureStyle(temperature)}>
                    <Thermometer className="h-4 w-4" />
                    <span className="text-sm font-semibold">{temperature}°</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 rounded-full text-xs font-medium px-3 bg-transparent">
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
                      <DropdownMenuItem onClick={handleDeletePost} className="cursor-pointer text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                        <Search className="mr-2 h-4 w-4" />
                        해당 아이디로 검색
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleBlockUser} className="cursor-pointer text-destructive">
                        <Ban className="mr-2 h-4 w-4" />
                        차단하기
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground leading-snug text-pretty">{post.title}</h2>
            <div className="pt-3 px-1">
              {typeof post.content === 'string' ? (
                <p className="text-foreground leading-relaxed">{post.content}</p>
              ) : (
                // TipTap JSON 렌더링 (임베드 포함)
                <TipTapContent content={post.content} />
              )}
            </div>
            {/* 텍스트 URL로만 저장된 임베드 fallback 렌더링 */}
            {typeof post.content === 'object' && (() => {
              const embeds = extractEmbedsFromTipTapJSON(post.content)
              // embed 노드가 아닌 텍스트에서 추출된 임베드만 표시
              const hasRealEmbedNode = post.content?.content?.some?.((n: any) => n.type === 'embed')
              if (hasRealEmbedNode || embeds.length === 0) return null
              return (
                <div className="space-y-3 mt-2">
                  {embeds.map((embed, i) => (
                    <EmbedPreviewCard
                      key={i}
                      provider={embed.attrs.provider}
                      url={embed.attrs.url}
                      title={embed.attrs.title}
                      thumbnail_url={embed.attrs.thumbnail_url}
                      author_name={embed.attrs.author_name}
                    />
                  ))}
                </div>
              )
            })()}

            {/* Image */}
            {post.image && (
              <div className="relative w-full aspect-[2/1] rounded-lg overflow-hidden bg-muted">
                <Image src={post.image || "/placeholder.svg"} alt="Post image" fill className="object-cover" />
              </div>
            )}
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
      </Card>

      {/* Comments Section */}
      <CommentSection
        postId={post.id}
        onCommentCountChange={handleCommentCountChange}
      />
    </div>
  )
}
