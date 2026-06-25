import type { TitleDisplay } from "./user"

/** TipTap 에디터 JSON 노드 */
export interface TipTapNode {
  type: string
  content?: TipTapNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** 게시글 분류용 flair (post_flairs 테이블 — 게시판 내 세부 카테고리, 예: "아스날", "분석") */
export interface PostFlair {
  id: string
  name: string
  color: string | null
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
  flairTitle?: string | null
  flair?: PostFlair | null
  /** 퍼온(OG) 글의 출처 — 상세 페이지 "원문 보기" 링크용. 일반 글은 null. */
  sourceUrl?: string | null
  sourceName?: string | null
}
