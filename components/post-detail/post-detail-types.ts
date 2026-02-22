export interface Post {
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
  temperature?: number
  isUpvoted: boolean
  userId?: string // Clerk user_id (optional, for user actions)
}

export interface Comment {
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
export function countAllComments(comments: Comment[]): number {
  return comments.reduce((acc, comment) => {
    const replyCount = comment.replies ? countAllComments(comment.replies) : 0
    return acc + 1 + replyCount
  }, 0)
}

// 상대적 시간 포맷팅
export function formatRelativeTime(date: Date): string {
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
export function transformComments(comments: { id: string; user_id: string; parent_id: string | null; content: string; vote_count: number; created_at: string }[], profiles: { user_id: string; nickname: string; avatar_url: string | null }[]): Comment[] {
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
