"use client"

// Re-export types for backward compatibility
export type {
  TickerTag,
  ItemDetail,
  TalkBoardItem,
  Comment,
  NewsTalkBoardProps,
} from "./news-talk-types"
export { NEWS_DETAILS, getDefaultComments } from "./news-talk-types"

// Re-export the detail panel component under the original name
export { TickerDetailPanel as NewsTalkBoard } from "./ticker-detail-panel"
