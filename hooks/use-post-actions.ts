"use client"

import { useState, useEffect } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"
import { reportClientError } from "@/lib/client-error"

/**
 * 글 투표/북마크 상태 + 데이터 로직 (Phase 4a — post-actions 에서 추출, 동작 변경 0).
 */
export function usePostActions(
  postId: string | number,
  initialUpvotes: number,
  initialIsUpvoted: boolean
) {
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
      } catch (error) {
        // 비핵심 프리페치 — 토스트 없이 보고만 (인벤토리 A-경)
        reportClientError("post.voteStatus", error)
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
      } catch (error) {
        // 비핵심 프리페치 — 토스트 없이 보고만 (인벤토리 A-경)
        reportClientError("post.bookmarkStatus", error)
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
    } catch (error) {
      reportClientError("post.vote", error)
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
      reportClientError("post.bookmark", error)
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "북마크 처리에 실패했습니다.",
      })
    }
  }

  return { voteCount, myVote, isBookmarked, handleVote, handleBookmark }
}
