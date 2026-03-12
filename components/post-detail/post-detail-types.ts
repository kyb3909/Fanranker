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
  createdAt?: Date | string
  titleDisplay?: TitleDisplay | null
}

export interface TitleDisplay {
  adjTitle?: string | null
  nounTitle?: string | null
  rarity?: "common" | "rare" | "epic" | "legendary" | null
}

export interface CommentSticker {
  id: string
  name: string
  image_url: string
}

export interface Comment {
  id: string | number
  userId?: string
  author: string
  avatar: string
  timestamp: string
  content: string
  upvotes: number
  titleDisplay?: TitleDisplay | null
  sticker?: CommentSticker | null
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

import { formatRelativeTime } from "@/lib/utils/date"
export { formatRelativeTime }

// DB 댓글 데이터를 컴포넌트 형식으로 변환 (계층 구조로)
export function transformComments(
  comments: {
    id: string
    user_id: string
    parent_id: string | null
    content: string
    vote_count: number
    created_at: string
    sticker_id?: string | null
    stickers?: { id: string; name: string; image_url: string } | null
  }[],
  profiles: { user_id: string; nickname: string; avatar_url: string | null }[],
  equippedTitles?: {
    user_id: string
    board_slug: string
    adj_titles: { title: string; rarity: string } | null
    noun_titles: { title: string } | null
  }[]
): Comment[] {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  // 칭호 매핑 (user_id → first equipped title)
  const titleMap = new Map<string, TitleDisplay>()
  if (equippedTitles) {
    for (const t of equippedTitles) {
      if (!titleMap.has(t.user_id)) {
        titleMap.set(t.user_id, {
          adjTitle: t.adj_titles?.title || null,
          nounTitle: t.noun_titles?.title || null,
          rarity: (t.adj_titles?.rarity as TitleDisplay["rarity"]) || null,
        })
      }
    }
  }

  // 댓글 맵 생성
  const commentMap = new Map<string, Comment>()
  const rootComments: Comment[] = []

  // 먼저 모든 댓글을 맵에 추가
  comments.forEach((comment) => {
    const profile = profileMap.get(comment.user_id)
    const titleDisplay = titleMap.get(comment.user_id) || null
    const transformed: Comment = {
      id: comment.id,
      userId: comment.user_id,
      author: profile?.nickname || "익명",
      avatar: profile?.avatar_url || "/placeholder-user.jpg",
      timestamp: formatRelativeTime(new Date(comment.created_at)),
      content: comment.content,
      upvotes: comment.vote_count || 0,
      titleDisplay,
      sticker: comment.stickers
        ? {
            id: comment.stickers.id,
            name: comment.stickers.name,
            image_url: comment.stickers.image_url,
          }
        : null,
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
    const aTime = comments.find((c) => c.id === a.id)?.created_at || ""
    const bTime = comments.find((c) => c.id === b.id)?.created_at || ""
    return new Date(aTime).getTime() - new Date(bTime).getTime()
  })

  // 각 댓글의 대댓글도 정렬
  const sortReplies = (comment: Comment) => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort((a, b) => {
        const aTime = comments.find((c) => c.id === a.id)?.created_at || ""
        const bTime = comments.find((c) => c.id === b.id)?.created_at || ""
        return new Date(aTime).getTime() - new Date(bTime).getTime()
      })
      comment.replies.forEach(sortReplies)
    }
  }
  rootComments.forEach(sortReplies)

  return rootComments
}
