"use client"

import { useState, useEffect } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { MessageCircle, Bookmark } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { ShareMenu } from "@/components/share-menu"
import { VoteButtons } from "@/components/vote-buttons"

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
  const { openSignIn } = useClerk()
  const [voteCount, setVoteCount] = useState(initialUpvotes)
  const [myVote, setMyVote] = useState<"up" | "down" | null>(initialIsUpvoted ? "up" : null)
  const [isBookmarked, setIsBookmarked] = useState(false)

  // 사용자의 투표 상태 확인 (로그인 시에만)
  useEffect(() => {
    if (!isSignedIn) return

    async function checkVoteStatus() {
      try {
        const response = await fetch(`/api/posts/${postId}/vote`)
        if (response.ok) {
          const { voted, voteType } = await response.json()
          setMyVote(voted ? voteType : null)
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

  const handleVote = async (type: "up" | "down") => {
    if (!isSignedIn) {
      openSignIn()
      return
    }

    const prevVote = myVote
    const prevCount = voteCount

    // 낙관적 업데이트
    if (myVote === type) {
      setMyVote(null)
      setVoteCount((prev) => (type === "up" ? prev - 1 : prev + 1))
    } else {
      const delta = type === "up" ? 1 : -1
      const reverseDelta = prevVote ? (prevVote === "up" ? -1 : 1) : 0
      setMyVote(type)
      setVoteCount((prev) => prev + delta + reverseDelta)
    }

    try {
      const response = await fetch(`/api/posts/${postId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (!response.ok) throw new Error()
      const data = await response.json()
      setVoteCount(data.voteCount)
      setMyVote(data.voteType)
    } catch {
      setMyVote(prevVote)
      setVoteCount(prevCount)
      toast({
        variant: "destructive",
        title: "오류",
        description: "투표 처리에 실패했습니다.",
      })
    }
  }

  const handleBookmark = async () => {
    if (!isSignedIn) {
      openSignIn()
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
      <VoteButtons voteCount={voteCount} myVote={myVote} onVote={handleVote} size="md" />

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
