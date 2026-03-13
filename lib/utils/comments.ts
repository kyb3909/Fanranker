// ============================================
// 댓글 유틸 함수
// ============================================

import type {
  Comment,
  TitleDisplay,
  CommentSticker,
} from "@/components/post-detail/post-detail-types"
import { formatRelativeTime } from "@/lib/utils/date"

/**
 * 모든 댓글과 대댓글을 재귀적으로 카운트
 */
export function countAllComments(comments: Comment[]): number {
  return comments.reduce((acc, comment) => {
    const replyCount = comment.replies ? countAllComments(comment.replies) : 0
    return acc + 1 + replyCount
  }, 0)
}

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

  // DB에서 이미 created_at ASC로 정렬되어 오므로 삽입 순서가 곧 시간순.
  // 별도 정렬 불필요.

  return rootComments
}
