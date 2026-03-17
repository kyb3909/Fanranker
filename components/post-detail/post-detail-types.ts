export type { Post } from "@/types/post"
export type { TitleDisplay } from "@/types/user"

import type { TitleDisplay } from "@/types/user"

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
  createdAt: string
  content: string
  upvotes: number
  titleDisplay?: TitleDisplay | null
  sticker?: CommentSticker | null
  replies?: Comment[]
}

// Re-export utils for backward compatibility
export { countAllComments, transformComments } from "@/lib/utils/comments"
export { formatRelativeTime } from "@/lib/utils/date"
