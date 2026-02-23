/** Community definition with display metadata */
export interface CommunityInfo {
  slug: string
  name: string
  emoji: string
}

/** All active communities in display order */
export const ALL_COMMUNITIES: CommunityInfo[] = [
  { slug: "overseas-football", name: "해외축구", emoji: "⚽" },
  { slug: "domestic-football", name: "국내축구", emoji: "🏟️" },
  { slug: "baseball", name: "야구", emoji: "⚾" },
  { slug: "basketball", name: "농구", emoji: "🏀" },
  { slug: "volleyball", name: "배구", emoji: "🏐" },
  { slug: "esports", name: "e스포츠", emoji: "🎮" },
  { slug: "free-board", name: "자유게시판", emoji: "💬" },
  { slug: "tips", name: "정보게시판", emoji: "📊" },
  { slug: "movies", name: "영화", emoji: "🎬" },
]

/** Canonical community slug → Korean display name mapping */
export const COMMUNITY_NAMES: Record<string, string> = {
  ...Object.fromEntries(ALL_COMMUNITIES.map(c => [c.slug, c.name])),
  // Legacy slugs (used in older profile data)
  "free": "자유게시판",
  "humor": "유머게시판",
  "soccer": "축구게시판",
  "stock": "주식게시판",
  "crypto": "코인게시판",
}
