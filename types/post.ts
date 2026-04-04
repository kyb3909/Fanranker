import type { TitleDisplay } from "./user"

/** TipTap 에디터 JSON 노드 */
export interface TipTapNode {
  type: string
  content?: TipTapNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** 피드/카드에 표시되는 게시글 (변환된 형태) */
export interface Post {
  id: string | number
  community: string
  communitySlug?: string
  author: string
  avatar: string
  userId?: string
  timestamp: string
  title: string
  content: string | TipTapNode
  image?: string
  upvotes: number
  comments: number
  temperature?: number
  isUpvoted: boolean
  createdAt?: Date | string
  titleDisplay?: TitleDisplay | null
}
