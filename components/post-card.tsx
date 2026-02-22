"use client"

import { useState, memo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowUp, ArrowDown, MessageCircle, MoreHorizontal, Thermometer, Bookmark, Search, Ban, Pencil, Trash2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUser } from "@clerk/nextjs"
import { ShareMenu } from "@/components/share-menu"
import { extractFirstEmbedFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { EmbedPreviewCard } from "@/components/embed-preview-card"

export interface TipTapNode {
  type?: string
  content?: TipTapNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/**
 * TipTap JSON에서 텍스트만 추출 (피드 미리보기용)
 */
function extractTextFromTipTapJSON(content: TipTapNode): string {
  if (!content || typeof content !== 'object') {
    return ''
  }

  if (content.type === 'text' && content.text) {
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content
      .map((node) => extractTextFromTipTapJSON(node))
      .join(' ')
  }

  return ''
}

interface Post {
  id: number | string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | TipTapNode // string 또는 TipTap JSON
  image?: string
  upvotes: number
  comments: number
  temperature?: number
  isUpvoted: boolean
  views?: number
  userId?: string // Clerk user_id (optional, for user actions)
}

interface PostCardProps {
  post: Post
  /** 첫 번째 게시물인 경우 true - LCP 이미지 최적화 */
  priority?: boolean
}

// 단일 액센트 색상 시스템 (Teal) - 접근성 대비 개선
const BADGE_COLOR = { bg: "bg-primary/15", text: "text-foreground", border: "border-primary/30" }

export const PostCard = memo(function PostCard({ post, priority = false }: PostCardProps) {
  const router = useRouter()
  const { user } = useUser()
  const isAuthor = post.userId === user?.id
  const [upvotes, setUpvotes] = useState(post.upvotes)

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
  const [isUpvoted, setIsUpvoted] = useState(post.isUpvoted)
  const [isBookmarked, setIsBookmarked] = useState(false)

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(post.author)}&type=nickname`)
  }

  const handleBlockUser = () => {
    if (confirm(`${post.author}님을 차단하시겠습니까?`)) {
      alert('차단 기능은 준비 중입니다.')
    }
  }

  const handleUpvote = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'up' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '투표 처리에 실패했습니다.')
      }

      const { action, voteCount } = await response.json()

      // 로컬 상태 업데이트 (서버에서 받은 정확한 vote_count 사용)
      if (voteCount !== undefined) {
        setUpvotes(voteCount)
      } else {
        // fallback: 로컬 계산
        if (action === 'deleted') {
          setUpvotes(Math.max(0, upvotes - 1))
        } else {
          setUpvotes(isUpvoted ? upvotes : upvotes + 1)
        }
      }
      
      setIsUpvoted(action !== 'deleted')
    } catch {
      // 에러가 발생해도 사용자에게 알리지 않음 (피드에서는 조용히 실패)
    }
  }

  // 북마크 상태 확인 (lazy - 버튼 호버 시에만)
  const [bookmarkChecked, setBookmarkChecked] = useState(false)
  
  const checkBookmarkStatus = async () => {
    if (bookmarkChecked) return
    try {
      const response = await fetch(`/api/posts/${post.id}/bookmark`)
      if (response.ok) {
        const { bookmarked } = await response.json()
        setIsBookmarked(bookmarked)
      }
      setBookmarkChecked(true)
    } catch {
      // Silent fail - bookmark status check is non-critical
    }
  }

  const handleBookmark = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/bookmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '북마크 처리에 실패했습니다.')
      }

      const { bookmarked } = await response.json()
      setIsBookmarked(bookmarked)
    } catch (error) {
      alert(error instanceof Error ? error.message : '북마크 처리에 실패했습니다.')
    }
  }

  const temperature = post.temperature ?? Math.min(100, Math.floor((upvotes * 2 + post.comments * 3) / 10))
  // 접근성 대비 개선: 더 진한 색상 사용 (WCAG AA 4.5:1 충족)
  const getTemperatureColor = (temp: number) => {
    if (temp >= 80) return "text-red-600"
    if (temp >= 60) return "text-orange-600"
    if (temp >= 40) return "text-amber-600"
    return "text-blue-700"
  }

  const communityLink = post.communitySlug || post.community
  
  // TipTap JSON에서 첫 번째 임베드 추출 (피드 미리보기용)
  const firstEmbed = typeof post.content === 'object' 
    ? extractFirstEmbedFromTipTapJSON(post.content)
    : null

  // 이미지 우선순위: 1) 직접 업로드한 이미지, 2) 임베드 썸네일
  const displayImage = post.image || firstEmbed?.attrs.thumbnail_url || null

  return (
    <article>
    <Card className="overflow-hidden border border-border bg-card hover:border-muted-foreground/30 transition-colors">
      <div className="p-4 sm:p-5">
        
        {/* ===== HEADER: 카테고리 + 메타 정보 (포털 스타일) ===== */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* 커뮤니티 배지 - Teal 액센트 */}
            <Link href={`/community/${communityLink}`}>
              <span className={`text-[13px] font-medium px-2.5 py-1 rounded-md ${BADGE_COLOR.bg} ${BADGE_COLOR.text} border ${BADGE_COLOR.border} hover:opacity-80 transition-opacity`}>
                {post.community}
              </span>
            </Link>
            
          </div>
          
          {/* 우측: 시간 + 더보기 */}
          <div className="flex items-center gap-1">
            <span className="text-[13px] text-muted-foreground">{post.timestamp}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 min-w-[32px]" aria-label="더보기 메뉴">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
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

        {/* ===== CONTENT SECTION ===== */}
        <div className="space-y-2.5">
          {/* 제목 */}
          <Link href={`/post/${post.id}`} className="block group">
            <h2 className="text-[16px] sm:text-[17px] font-semibold text-foreground leading-[1.4] group-hover:text-primary transition-colors line-clamp-2">
              {post.title}
            </h2>
          </Link>
          
          {/* 본문 */}
          {typeof post.content === 'string' ? (
            <p className="text-[14px] text-foreground/80 leading-[1.6] line-clamp-2">
              {post.content}
            </p>
          ) : (
            // TipTap JSON의 경우 텍스트만 추출하여 표시
            <p className="text-[14px] text-foreground/80 leading-[1.6] line-clamp-2">
              {extractTextFromTipTapJSON(post.content)}
            </p>
          )}

          {/* 이미지 또는 임베드 미리보기 (피드용) */}
          {displayImage && !firstEmbed && (
            // 직접 업로드한 이미지가 있고 임베드가 없는 경우
            <Link href={`/post/${post.id}`} className="block mt-2">
              <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted hover:opacity-95 transition-opacity">
                <Image 
                  src={displayImage} 
                  alt={post.title || "Post image"} 
                  fill 
                  className="object-cover" 
                  priority={priority}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
                />
              </div>
            </Link>
          )}

          {/* 임베드 미리보기 (피드용) - 이미지가 없을 때만 표시 */}
          {firstEmbed && !post.image && (
            <div className="mt-2">
              <EmbedPreviewCard
                provider={firstEmbed.attrs.provider}
                url={firstEmbed.attrs.url}
                title={firstEmbed.attrs.title}
                thumbnail_url={firstEmbed.attrs.thumbnail_url}
                author_name={firstEmbed.attrs.author_name}
                priority={priority}
              />
            </div>
          )}
        </div>

        {/* ===== FOOTER: 작성자 + 메타 + 액션 (포털 스타일) ===== */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          {/* 좌측: 작성자 정보 */}
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={post.avatar || "/placeholder.svg"} alt={post.author} />
              <AvatarFallback className="text-[10px]">{post.author?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[13px] font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
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
            
            {/* 구분선 */}
            <span className="text-border">|</span>
            
            {/* 온도 */}
            <div className={`flex items-center gap-0.5 ${getTemperatureColor(temperature)}`}>
              <Thermometer className="h-3.5 w-3.5" />
              <span className="text-[12px] font-semibold tabular-nums">{temperature}°</span>
            </div>
          </div>

          {/* 우측: 액션 버튼 - 터치 타겟 최소 44px, 간격 8px 이상 */}
          <div className="flex items-center gap-1">
            {/* 추천 */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 min-h-[36px] px-3 gap-1.5 rounded-md ${isUpvoted ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleUpvote}
              aria-label={`추천 ${upvotes}개`}
              aria-pressed={isUpvoted}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
              <span className="text-[12px] font-semibold tabular-nums">{upvotes.toLocaleString()}</span>
            </Button>

            {/* 댓글 */}
            <Link href={`/post/${post.id}`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 min-h-[36px] px-3 gap-1.5 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={`댓글 ${post.comments}개`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-[12px] font-semibold tabular-nums">{post.comments}</span>
              </Button>
            </Link>

            {/* 북마크 */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 min-w-[36px] ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleBookmark}
              onMouseEnter={checkBookmarkStatus}
              onFocus={checkBookmarkStatus}
              aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
              aria-pressed={isBookmarked}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} aria-hidden="true" />
            </Button>

            {/* 공유 */}
            <ShareMenu postId={post.id} postTitle={post.title} />
          </div>
        </div>
      </div>
    </Card>
    </article>
  )
})
