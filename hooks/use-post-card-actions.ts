import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"
import { useBlockedUsers } from "@/hooks/use-blocked-users"

interface UsePostCardActionsOptions {
  postId: number | string
  author: string
  authorId?: string
  upvotes: number
  isUpvoted: boolean
}

export function usePostCardActions({
  postId,
  author,
  authorId,
  upvotes,
  isUpvoted,
}: UsePostCardActionsOptions) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const { toggleBlock } = useBlockedUsers()

  const [voteCount, setVoteCount] = useState(upvotes)
  const [myVote, setMyVote] = useState<"up" | "down" | null>(isUpvoted ? "up" : null)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkChecked, setBookmarkChecked] = useState(false)

  const handleEditPost = () => {
    router.push(`/write?edit=${postId}`)
  }

  const handleDeletePost = async () => {
    if (!confirm("이 글을 삭제하시겠습니까?")) return
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" })
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

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(author)}&type=nickname`)
  }

  const handleBlockUser = async () => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    if (!authorId) return
    if (!confirm(`${author}님을 차단하시겠습니까?\n차단하면 이 사용자의 글이 보이지 않아요.`))
      return
    try {
      const result = await toggleBlock(authorId)
      if (!result) {
        toast({ variant: "destructive", title: "오류", description: "차단 처리에 실패했습니다." })
        return
      }
      toast({
        title: result.blocked ? "차단 완료" : "차단 해제",
        description: result.blocked
          ? `${author}님을 차단했어요.`
          : `${author}님 차단을 해제했어요.`,
      })
    } catch {
      toast({ variant: "destructive", title: "오류", description: "차단 중 오류가 발생했습니다." })
    }
  }

  const handleVote = async (type: "up" | "down") => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    const prevVote = myVote
    const prevCount = voteCount
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
    }
  }

  const checkBookmarkStatus = async () => {
    if (bookmarkChecked || !isSignedIn) return
    try {
      const response = await fetch(`/api/posts/${postId}/bookmark`)
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
    if (!isSignedIn) {
      openSignIn()
      return
    }
    try {
      const response = await fetch(`/api/posts/${postId}/bookmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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

  return {
    voteCount,
    myVote,
    isBookmarked,
    handleEditPost,
    handleDeletePost,
    handleSearchByAuthor,
    handleBlockUser,
    handleVote,
    handleBookmark,
    checkBookmarkStatus,
  }
}
