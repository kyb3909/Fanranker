"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, MessageCircle, Bookmark } from "lucide-react"
import { ShareMenu } from "@/components/share-menu"

interface PostActionsProps {
  postId: string | number
  postTitle: string
  initialUpvotes: number
  initialIsUpvoted: boolean
  commentCount: number
}

export function PostActions({
  postId,
  postTitle,
  initialUpvotes,
  initialIsUpvoted,
  commentCount,
}: PostActionsProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes)
  const [isUpvoted, setIsUpvoted] = useState(initialIsUpvoted)
  const [isBookmarked, setIsBookmarked] = useState(false)

  // 사용자의 투표 상태 확인
  useEffect(() => {
    async function checkVoteStatus() {
      try {
        const response = await fetch(`/api/posts/${postId}/vote`)
        if (response.ok) {
          const { voted, voteType } = await response.json()
          setIsUpvoted(voted && voteType === 'up')
        }
      } catch {
        // Silent fail - vote status check is non-critical
      }
    }

    checkVoteStatus()
  }, [postId])

  // 북마크 상태 확인
  useEffect(() => {
    async function checkBookmarkStatus() {
      try {
        const response = await fetch(`/api/posts/${postId}/bookmark`)
        if (response.ok) {
          const { bookmarked } = await response.json()
          setIsBookmarked(bookmarked)
        }
      } catch {
        // Silent fail - bookmark status check is non-critical
      }
    }

    checkBookmarkStatus()
  }, [postId])

  const handleUpvote = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/vote`, {
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
      alert(error instanceof Error ? error.message : '투표 처리에 실패했습니다.')
    }
  }

  const handleBookmark = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/bookmark`, {
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
      alert(error instanceof Error ? error.message : '북마크 처리에 실패했습니다.')
    }
  }

  return (
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
        <span className="text-sm font-medium">{commentCount}</span>
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
      <ShareMenu postId={postId} postTitle={postTitle} />
    </div>
  )
}
