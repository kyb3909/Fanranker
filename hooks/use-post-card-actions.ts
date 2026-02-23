import { useState } from "react"
import { useRouter } from "next/navigation"

interface UsePostCardActionsOptions {
  postId: number | string
  author: string
  upvotes: number
  isUpvoted: boolean
}

export function usePostCardActions({ postId, author, upvotes, isUpvoted }: UsePostCardActionsOptions) {
  const router = useRouter()

  const [voteCount, setVoteCount] = useState(upvotes)
  const [myVote, setMyVote] = useState<'up' | 'down' | null>(isUpvoted ? 'up' : null)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkChecked, setBookmarkChecked] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const handleEditPost = () => {
    router.push(`/write?edit=${postId}`)
  }

  const handleDeletePost = async () => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
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

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(author)}&type=nickname`)
  }

  const handleBlockUser = () => {
    if (confirm(`${author}님을 차단하시겠습니까?`)) {
      alert('차단 기능은 준비 중입니다.')
    }
  }

  const handleVote = async (type: 'up' | 'down') => {
    const prevVote = myVote
    const prevCount = voteCount
    if (myVote === type) {
      setMyVote(null)
      setVoteCount(prev => type === 'up' ? prev - 1 : prev + 1)
    } else {
      const delta = type === 'up' ? 1 : -1
      const reverseDelta = prevVote ? (prevVote === 'up' ? -1 : 1) : 0
      setMyVote(type)
      setVoteCount(prev => prev + delta + reverseDelta)
    }
    try {
      const response = await fetch(`/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (bookmarkChecked) return
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
    try {
      const response = await fetch(`/api/posts/${postId}/bookmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return {
    voteCount,
    myVote,
    isBookmarked,
    reportOpen,
    setReportOpen,
    handleEditPost,
    handleDeletePost,
    handleSearchByAuthor,
    handleBlockUser,
    handleVote,
    handleBookmark,
    checkBookmarkStatus,
  }
}
