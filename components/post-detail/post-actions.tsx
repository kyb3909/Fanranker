"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, MessageCircle, Bookmark } from "lucide-react"
import { toast } from "@/hooks/use-toast"
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
  const { isSignedIn } = useAuth()
  const [upvotes, setUpvotes] = useState(initialUpvotes)
  const [isUpvoted, setIsUpvoted] = useState(initialIsUpvoted)
  const [isBookmarked, setIsBookmarked] = useState(false)

  // 사용자의 투표 상태 확인 (로그인 시에만)
  useEffect(() => {
    if (!isSignedIn) return

    async function checkVoteStatus() {
      try {
        const response = await fetch(`/api/posts/${postId}/vote`)
        if (response.ok) {
          const { voted, voteType } = await response.json()
          setIsUpvoted(voted && voteType === "up")
        }
      } catch {
        // Silent fail - vote status check is non-critical
      }
    }

    checkVoteStatus()
  }, [postId, isSignedIn])

  // 북마크 상태 확인 (로그인 시에만)
  useEffect(() => {
    if (!isSignedIn) return

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
  }, [postId, isSignedIn])

  const handleUpvote = async () => {
    if (!isSignedIn) {
      toast({ variant: "destructive", title: "로그인 필요", description: "로그인이 필요합니다." })
      return
    }

    try {
      const response = await fetch(`/api/posts/${postId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "up" }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "투표 처리에 실패했습니다.")
      }

      const { action, voteType, voteCount } = await response.json()

      // 로컬 상태 업데이트 (서버에서 받은 정확한 vote_count 사용)
      if (voteCount !== undefined) {
        setUpvotes(voteCount)
      } else {
        // fallback: 로컬 계산
        if (action === "deleted") {
          setUpvotes(Math.max(0, upvotes - 1))
        } else {
          setUpvotes(isUpvoted ? upvotes : upvotes + 1)
        }
      }

      setIsUpvoted(action !== "deleted" && voteType === "up")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "투표 처리에 실패했습니다.",
      })
    }
  }

  const handleBookmark = async () => {
    if (!isSignedIn) {
      toast({ variant: "destructive", title: "로그인 필요", description: "로그인이 필요합니다." })
      return
    }

    try {
      const response = await fetch(`/api/posts/${postId}/bookmark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "북마크 처리에 실패했습니다.")
      }

      const { bookmarked } = await response.json()
      setIsBookmarked(bookmarked)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "북마크 처리에 실패했습니다.",
      })
    }
  }

  return (
    <div className="mt-4 flex items-center gap-2">
      {/* Upvote/Downvote */}
      <div className="bg-secondary flex items-center gap-1 rounded-full px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-full ${isUpvoted ? "text-primary" : "text-muted-foreground"}`}
          onClick={handleUpvote}
          aria-label="추천"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
        <span className="text-foreground min-w-[2rem] text-center text-sm font-semibold">
          {upvotes}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground h-8 w-8 rounded-full"
          aria-label="비추천"
        >
          <ArrowDown className="h-5 w-5" />
        </Button>
      </div>

      {/* Comments */}
      <Button
        variant="ghost"
        size="sm"
        className="bg-secondary text-foreground hover:bg-secondary/80 gap-2 rounded-full"
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
        aria-label={isBookmarked ? "북마크 해제" : "북마크"}
      >
        <Bookmark className={`h-5 w-5 ${isBookmarked ? "fill-current" : ""}`} />
      </Button>

      {/* Share */}
      <ShareMenu postId={postId} postTitle={postTitle} />
    </div>
  )
}
