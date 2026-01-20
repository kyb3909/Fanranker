"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, ArrowDown, MessageCircle, MoreHorizontal, Thermometer, Search, Ban, Bookmark } from "lucide-react"
import Image from "next/image"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShareMenu } from "@/components/share-menu"
import { TipTapContent } from "@/components/tiptap-content"

const MOCK_COMMENTS = [
  {
    id: 1,
    author: "developerJoe",
    avatar: "/developer-working.png",
    timestamp: "2시간 전",
    content: "정말 공감되는 내용입니다. 특히 GitHub Copilot을 사용하면서 생산성이 30% 이상 향상된 것 같아요.",
    upvotes: 45,
    replies: [
      {
        id: 11,
        author: "aiEnthusiast",
        avatar: "/placeholder.svg?height=40&width=40",
        timestamp: "1시간 전",
        content: "동의합니다! Copilot 덕분에 반복 작업이 많이 줄었어요.",
        upvotes: 12,
      },
      {
        id: 12,
        author: "skepticalDev",
        avatar: "/placeholder.svg?height=40&width=40",
        timestamp: "1시간 전",
        content: "그런데 AI가 생성한 코드의 보안 문제는 어떻게 생각하시나요?",
        upvotes: 8,
      },
      {
        id: 13,
        author: "developerJoe",
        avatar: "/developer-working.png",
        timestamp: "30분 전",
        content: "좋은 지적이에요. 항상 코드 리뷰는 필수라고 생각합니다.",
        upvotes: 15,
      },
    ],
  },
  {
    id: 2,
    author: "codeNinja",
    avatar: "/stealthy-ninja.png",
    timestamp: "1시간 전",
    content: "하지만 AI에 너무 의존하면 기본기가 약해질 수 있다는 우려도 있습니다. 균형이 중요한 것 같아요.",
    upvotes: 32,
    replies: [
      {
        id: 21,
        author: "juniorDev",
        avatar: "/placeholder.svg?height=40&width=40",
        timestamp: "50분 전",
        content: "신입 개발자로서 이 부분이 걱정되네요. 어떻게 균형을 맞춰야 할까요?",
        upvotes: 5,
      },
      {
        id: 22,
        author: "codeNinja",
        avatar: "/stealthy-ninja.png",
        timestamp: "40분 전",
        content: "기본기를 먼저 탄탄히 하고, AI는 생산성 도구로만 활용하시는 걸 추천드립니다.",
        upvotes: 18,
      },
    ],
  },
  {
    id: 3,
    author: "seniorDev",
    avatar: "/diverse-group-seniors.png",
    timestamp: "30분 전",
    content: "AI는 도구일 뿐이에요. 결국 코드의 품질과 설계는 개발자의 몫이라고 생각합니다.",
    upvotes: 78,
    replies: [
      {
        id: 31,
        author: "architectGuru",
        avatar: "/placeholder.svg?height=40&width=40",
        timestamp: "20분 전",
        content: "정확한 지적입니다. 아키텍처 설계는 AI가 대체할 수 없죠.",
        upvotes: 22,
      },
    ],
  },
]

interface Post {
  id: string | number
  community: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | any // string 또는 TipTap JSON
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  userId?: string // Clerk user_id (optional, for user actions)
}

interface Comment {
  id: string | number
  author: string
  avatar: string
  timestamp: string
  content: string
  upvotes: number
  replies?: Comment[]
}

/**
 * 모든 댓글과 대댓글을 재귀적으로 카운트
 */
function countAllComments(comments: Comment[]): number {
  return comments.reduce((acc, comment) => {
    const replyCount = comment.replies ? countAllComments(comment.replies) : 0
    return acc + 1 + replyCount
  }, 0)
}

interface CommentItemProps {
  comment: Comment
  replyingTo: string | number | null
  replyText: string
  onReplyTextChange: (text: string) => void
  onSetReplyingTo: (id: string | number | null) => void
  onReplySubmit: (commentId: string | number) => void
  depth: number
  isSubmittingReply?: string | number | null
}

/**
 * 재귀적으로 댓글을 렌더링하는 컴포넌트
 * 무한 중첩 대댓글 지원
 */
function CommentItem({
  comment,
  replyingTo,
  replyText,
  onReplyTextChange,
  onSetReplyingTo,
  onReplySubmit,
  depth,
  isSubmittingReply = null,
}: CommentItemProps) {
  const isReplying = replyingTo === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const maxDepth = 5 // 최대 중첩 깊이 제한 (UI 복잡도 방지)

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Avatar className={depth === 0 ? "h-10 w-10" : "h-8 w-8"}>
          <AvatarImage src={comment.avatar || "/placeholder.svg"} alt={comment.author} />
          <AvatarFallback>{comment.author[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-foreground ${depth === 0 ? "" : "text-sm"}`}>
              {comment.author}
            </span>
            <span className={`text-muted-foreground ${depth === 0 ? "text-sm" : "text-xs"}`}>
              {comment.timestamp}
            </span>
          </div>
          <p className={`text-foreground leading-relaxed ${depth === 0 ? "" : "text-sm"}`}>
            {comment.content}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className={`gap-1 text-muted-foreground ${depth === 0 ? "h-8" : "h-7"}`}>
              <ArrowUp className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
              <span className={depth === 0 ? "text-sm" : "text-xs"}>{comment.upvotes}</span>
            </Button>
            {depth < maxDepth && (
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1 text-muted-foreground ${depth === 0 ? "h-8" : "h-7"}`}
                onClick={() => onSetReplyingTo(isReplying ? null : comment.id)}
              >
                <MessageCircle className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
                <span className={depth === 0 ? "text-sm" : "text-xs"}>
                  답글 {comment.replies?.length || 0}개
                </span>
              </Button>
            )}
          </div>

          {/* Reply Input */}
          {isReplying && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="답글을 입력하세요..."
                className="min-h-[80px] resize-none"
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    onReplySubmit(comment.id)
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onSetReplyingTo(null)
                    onReplyTextChange("")
                  }}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  onClick={() => onReplySubmit(comment.id)}
                  disabled={!replyText.trim() || isSubmittingReply === comment.id}
                >
                  {isSubmittingReply === comment.id ? '작성 중...' : '답글 작성'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Replies - 재귀적으로 렌더링 */}
      {hasReplies && (
        <div className={`space-y-4 border-l-2 border-border pl-4 ${depth === 0 ? "ml-12" : "ml-8"}`}>
          {comment.replies!.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replyingTo={replyingTo}
              replyText={replyText}
              onReplyTextChange={onReplyTextChange}
              onSetReplyingTo={onSetReplyingTo}
              onReplySubmit={onReplySubmit}
              depth={depth + 1}
              isSubmittingReply={isSubmittingReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 상대적 시간 포맷팅
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

// DB 댓글 데이터를 컴포넌트 형식으로 변환 (계층 구조로)
function transformComments(comments: any[], profiles: any[]): Comment[] {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))
  
  // 댓글 맵 생성
  const commentMap = new Map<string, Comment>()
  const rootComments: Comment[] = []

  // 먼저 모든 댓글을 맵에 추가
  comments.forEach((comment) => {
    const profile = profileMap.get(comment.user_id)
    const transformed: Comment = {
      id: comment.id,
      author: profile?.nickname || "익명",
      avatar: profile?.avatar_url || "/placeholder-user.jpg",
      timestamp: formatRelativeTime(new Date(comment.created_at)),
      content: comment.content,
      upvotes: comment.vote_count || 0,
      replies: [],
    }
    commentMap.set(comment.id, transformed)
  })

  // 계층 구조 생성
  comments.forEach((comment) => {
    const transformed = commentMap.get(comment.id)!
    if (comment.parent_id) {
      // 대댓글
      const parent = commentMap.get(comment.parent_id)
      if (parent) {
        parent.replies = parent.replies || []
        parent.replies.push(transformed)
      }
    } else {
      // 부모 댓글
      rootComments.push(transformed)
    }
  })

  // 시간순 정렬
  rootComments.sort((a, b) => {
    const aTime = comments.find(c => c.id === a.id)?.created_at || ''
    const bTime = comments.find(c => c.id === b.id)?.created_at || ''
    return new Date(aTime).getTime() - new Date(bTime).getTime()
  })

  // 각 댓글의 대댓글도 정렬
  const sortReplies = (comment: Comment) => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort((a, b) => {
        const aTime = comments.find(c => c.id === a.id)?.created_at || ''
        const bTime = comments.find(c => c.id === b.id)?.created_at || ''
        return new Date(aTime).getTime() - new Date(bTime).getTime()
      })
      comment.replies.forEach(sortReplies)
    }
  }
  rootComments.forEach(sortReplies)

  return rootComments
}

export function PostDetailContent({ post }: { post: Post }) {
  const router = useRouter()
  const [upvotes, setUpvotes] = useState(post.upvotes)
  const [isUpvoted, setIsUpvoted] = useState(post.isUpvoted)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(true)
  const [commentText, setCommentText] = useState("")
  const [replyingTo, setReplyingTo] = useState<string | number | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [isSubmittingReply, setIsSubmittingReply] = useState<string | number | null>(null)

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

  // 댓글 로드
  useEffect(() => {
    async function loadComments() {
      setIsLoadingComments(true)
      try {
        const response = await fetch(`/api/comments?post_id=${post.id}`)
        if (!response.ok) {
          throw new Error('댓글을 불러오는데 실패했습니다.')
        }

        const { comments: fetchedComments, profiles } = await response.json()
        const transformedComments = transformComments(fetchedComments || [], profiles || [])
        setComments(transformedComments)
      } catch (error) {
        console.error('Failed to load comments:', error)
        setComments([])
      } finally {
        setIsLoadingComments(false)
      }
    }

    loadComments()
  }, [post.id])

  // 사용자의 투표 상태 확인
  useEffect(() => {
    async function checkVoteStatus() {
      try {
        const response = await fetch(`/api/posts/${post.id}/vote`)
        if (response.ok) {
          const { voted, voteType } = await response.json()
          setIsUpvoted(voted && voteType === 'up')
        }
      } catch (error) {
        console.error('Failed to check vote status:', error)
      }
    }

    checkVoteStatus()
  }, [post.id])

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

      const { action, voteType, voteCount } = await response.json()

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
      
      setIsUpvoted(action !== 'deleted' && voteType === 'up')
    } catch (error) {
      console.error('Failed to vote:', error)
      alert(error instanceof Error ? error.message : '투표 처리에 실패했습니다.')
    }
  }

  const handleCommentSubmit = async () => {
    if (!commentText.trim() || isSubmittingComment) {
      return
    }

    setIsSubmittingComment(true)
    const textToSubmit = commentText.trim()
    setCommentText("") // 즉시 입력 필드 비우기 (중복 제출 방지)

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: post.id,
          content: textToSubmit,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        // 쿨다운 에러인 경우 특별 처리
        if (response.status === 429 && error.code === 'COOLDOWN_ACTIVE') {
          throw new Error(error.error || '댓글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요.')
        }
        throw new Error(error.error || '댓글 작성에 실패했습니다.')
      }

      // 댓글 목록 다시 로드
      const commentsResponse = await fetch(`/api/comments?post_id=${post.id}`)
      if (commentsResponse.ok) {
        const { comments: fetchedComments, profiles } = await commentsResponse.json()
        const transformedComments = transformComments(fetchedComments || [], profiles || [])
        setComments(transformedComments)
      }
    } catch (error) {
      console.error('Failed to submit comment:', error)
      alert(error instanceof Error ? error.message : '댓글 작성에 실패했습니다.')
      setCommentText(textToSubmit) // 실패 시 텍스트 복원
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleReplySubmit = async (commentId: string | number) => {
    if (!replyText.trim() || isSubmittingReply === commentId) {
      return
    }

    setIsSubmittingReply(commentId)
    const textToSubmit = replyText.trim()
    setReplyText("") // 즉시 입력 필드 비우기 (중복 제출 방지)

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: post.id,
          parent_id: commentId,
          content: textToSubmit,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        // 쿨다운 에러인 경우 특별 처리
        if (response.status === 429 && error.code === 'COOLDOWN_ACTIVE') {
          throw new Error(error.error || '답글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요.')
        }
        throw new Error(error.error || '답글 작성에 실패했습니다.')
      }

      // 댓글 목록 다시 로드
      const commentsResponse = await fetch(`/api/comments?post_id=${post.id}`)
      if (commentsResponse.ok) {
        const { comments: fetchedComments, profiles } = await commentsResponse.json()
        const transformedComments = transformComments(fetchedComments || [], profiles || [])
        setComments(transformedComments)
      }

      setReplyingTo(null)
    } catch (error) {
      console.error('Failed to submit reply:', error)
      alert(error instanceof Error ? error.message : '답글 작성에 실패했습니다.')
      setReplyText(textToSubmit) // 실패 시 텍스트 복원
    } finally {
      setIsSubmittingReply(null)
    }
  }

  const temperature = Math.min(100, Math.floor((upvotes * 2 + post.comments * 3) / 10))
  const getTemperatureColor = (temp: number) => {
    if (temp >= 80) return "text-red-500"
    if (temp >= 60) return "text-orange-500"
    if (temp >= 40) return "text-yellow-500"
    return "text-blue-500"
  }

  return (
    <div className="space-y-4">
      {/* Post Detail Card */}
      <Card className="overflow-hidden border border-border bg-card">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={post.avatar || "/placeholder.svg"} alt={post.author} />
                <AvatarFallback>{post.author[0].toUpperCase()}</AvatarFallback>
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
                  <div className={`flex items-center gap-1 ${getTemperatureColor(temperature)}`}>
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
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground leading-snug text-pretty">{post.title}</h2>
            <div className="pt-3">
              {typeof post.content === 'string' ? (
                <p className="text-foreground leading-relaxed">{post.content}</p>
              ) : (
                // TipTap JSON 렌더링 (임베드 포함)
                <TipTapContent content={post.content} />
              )}
            </div>

            {/* Image */}
            {post.image && (
              <div className="relative w-full aspect-[2/1] rounded-lg overflow-hidden bg-muted">
                <Image src={post.image || "/placeholder.svg"} alt="Post image" fill className="object-cover" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            {/* Upvote/Downvote */}
            <div className="flex items-center gap-1 bg-secondary rounded-full px-1 py-1">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full ${isUpvoted ? "text-primary" : "text-muted-foreground"}`}
                onClick={handleUpvote}
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
              <span className="text-sm font-semibold min-w-[2rem] text-center text-foreground">{upvotes}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground">
                <ArrowDown className="h-5 w-5" />
              </Button>
            </div>

            {/* Comments */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-full bg-secondary text-foreground hover:bg-secondary/80"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{countAllComments(comments)}</span>
            </Button>

            {/* Bookmark */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-full ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleBookmark}
            >
              <Bookmark className={`h-5 w-5 ${isBookmarked ? "fill-current" : ""}`} />
            </Button>

            {/* Share */}
            <ShareMenu postId={post.id} postTitle={post.title} />
          </div>
        </div>
      </Card>

      {/* Comments Section */}
      <Card className="border border-border bg-card">
        <div className="p-6 space-y-6">
          <h3 className="text-xl font-semibold text-foreground">
            댓글 {countAllComments(comments)}개
          </h3>

          {/* Comment Input */}
          <div className="space-y-3">
            <Textarea
              placeholder="댓글을 입력하세요..."
              className="min-h-[100px] resize-none"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleCommentSubmit()
                }
              }}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleCommentSubmit}
                disabled={!commentText.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? '작성 중...' : '댓글 작성'}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Comment List */}
          <div className="space-y-6">
            {isLoadingComments ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">댓글을 불러오는 중...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">아직 댓글이 없습니다.</p>
              </div>
            ) : (
              comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  replyingTo={replyingTo}
                  replyText={replyText}
                  onReplyTextChange={setReplyText}
                  onSetReplyingTo={setReplyingTo}
                  onReplySubmit={handleReplySubmit}
                  depth={0}
                  isSubmittingReply={isSubmittingReply}
                />
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
