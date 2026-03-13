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

// Re-export utils for backward compatibility
export { countAllComments, transformComments } from "@/lib/utils/comments"
export { formatRelativeTime } from "@/lib/utils/date"
