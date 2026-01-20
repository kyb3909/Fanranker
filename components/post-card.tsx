"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowUp, ArrowDown, MessageCircle, MoreHorizontal, Thermometer, Eye, Bookmark, Search, Ban } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShareMenu } from "@/components/share-menu"
import { extractFirstEmbedFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { EmbedPreviewCard } from "@/components/embed-preview-card"

/**
 * TipTap JSON에서 텍스트만 추출 (피드 미리보기용)
 */
function extractTextFromTipTapJSON(content: any): string {
  if (!content || typeof content !== 'object') {
    return ''
  }

  if (content.type === 'text' && content.text) {
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content
      .map((node: any) => extractTextFromTipTapJSON(node))
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
  content: string | any // string 또는 TipTap JSON
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  views?: number
  userId?: string // Clerk user_id (optional, for user actions)
}

interface PostCardProps {
  post: Post
}

// 단일 액센트 색상 시스템 (Teal)
const BADGE_COLOR = { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" }

export function PostCard({ post }: PostCardProps) {
  const router = useRouter()
  const [upvotes, setUpvotes] = useState(post.upvotes)
  const [isUpvoted, setIsUpvoted] = useState(post.isUpvoted)
  const [isBookmarked, setIsBookmarked] = useState(false)

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(post.author)}&type=nickname`)
  }

  const handleBlockUser = () => {
    // TODO: 차단 기능 구현 (blocked_users 테이블 필요)
    if (confirm(`${post.author}님을 차단하시겠습니까?`)) {
      console.log('Block user:', post.userId || post.author)
      // 차단 로직 구현 예정
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

      const { action } = await response.json()

      // 로컬 상태 업데이트
      if (action === 'deleted') {
        setUpvotes(Math.max(0, upvotes - 1))
        setIsUpvoted(false)
      } else {
        setUpvotes(isUpvoted ? upvotes : upvotes + 1)
        setIsUpvoted(true)
      }
    } catch (error) {
      console.error('Failed to vote:', error)
      // 에러가 발생해도 사용자에게 알리지 않음 (피드에서는 조용히 실패)
    }
  }

  // 북마크 상태 확인
  useEffect(() => {
    async function checkBookmarkStatus() {
      try {
        const response = await fetch(`/api/posts/${post.id}/bookmark`)
        if (response.ok) {
          const { bookmarked } = await response.json()
          setIsBookmarked(bookmarked)
        }
      } catch (error) {
        console.error('Failed to check bookmark status:', error)
      }
    }

    checkBookmarkStatus()
  }, [post.id])

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
      console.error('Failed to toggle bookmark:', error)
      alert(error instanceof Error ? error.message : '북마크 처리에 실패했습니다.')
    }
  }

  const temperature = Math.min(100, Math.floor((upvotes * 2 + post.comments * 3) / 10))
  const getTemperatureColor = (temp: number) => {
    if (temp >= 80) return "text-red-500"
    if (temp >= 60) return "text-orange-500"
    if (temp >= 40) return "text-yellow-500"
    return "text-blue-500"
  }

  const communityLink = post.communitySlug || post.community
  
  // 조회수 (없으면 추천수 기반으로 생성)
  const views = post.views || Math.floor(upvotes * 3.5 + post.comments * 2)
  
  // TipTap JSON에서 첫 번째 임베드 추출 (피드 미리보기용)
  const firstEmbed = typeof post.content === 'object' 
    ? extractFirstEmbedFromTipTapJSON(post.content)
    : null

  // 이미지 우선순위: 1) 직접 업로드한 이미지, 2) 임베드 썸네일
  const displayImage = post.image || firstEmbed?.attrs.thumbnail_url || null

  return (
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
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </Button>
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
                <Image src={displayImage} alt="Post image" fill className="object-cover" />
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
              <AvatarFallback className="text-[10px]">{post.author[0]}</AvatarFallback>
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
            
            {/* 메타 정보: 조회수 */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-[12px] tabular-nums">{views.toLocaleString()}</span>
            </div>
            
            {/* 온도 */}
            <div className={`flex items-center gap-0.5 ${getTemperatureColor(temperature)}`}>
              <Thermometer className="h-3.5 w-3.5" />
              <span className="text-[12px] font-semibold tabular-nums">{temperature}°</span>
            </div>
          </div>

          {/* 우측: 액션 버튼 */}
          <div className="flex items-center gap-0.5">
            {/* 추천 */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 gap-1 rounded ${isUpvoted ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleUpvote}
            >
              <ArrowUp className="h-4 w-4" />
              <span className="text-[12px] font-semibold tabular-nums">{upvotes.toLocaleString()}</span>
            </Button>

            {/* 댓글 */}
            <Link href={`/post/${post.id}`}>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 rounded text-muted-foreground hover:text-foreground">
                <MessageCircle className="h-4 w-4" />
                <span className="text-[12px] font-semibold tabular-nums">{post.comments}</span>
              </Button>
            </Link>

            {/* 북마크 */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleBookmark}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} />
            </Button>

            {/* 공유 */}
            <ShareMenu postId={post.id} postTitle={post.title} />
          </div>
        </div>
      </div>
    </Card>
  )
}
