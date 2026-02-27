/** Community definition with display metadata */
export interface CommunityInfo {
  slug: string
  name: string
  emoji: string
}

/** 스포츠 게시판 */
export const SPORTS_COMMUNITIES: CommunityInfo[] = [
  { slug: "football", name: "축구", emoji: "⚽" },
  { slug: "baseball", name: "야구", emoji: "⚾" },
  { slug: "basketball", name: "농구", emoji: "🏀" },
  { slug: "volleyball", name: "배구", emoji: "🏐" },
]

/** 라이프 게시판 */
export const LIFE_COMMUNITIES: CommunityInfo[] = [
  { slug: "game", name: "게임", emoji: "🎮" },
  { slug: "movies", name: "영화", emoji: "🎬" },
  { slug: "music", name: "음악", emoji: "🎵" },
  { slug: "idol", name: "아이돌", emoji: "🎤" },
  { slug: "anime", name: "애니", emoji: "🤖" },
  { slug: "free-board", name: "자유", emoji: "💬" },
]

/** All active communities in display order */
export const ALL_COMMUNITIES: CommunityInfo[] = [...SPORTS_COMMUNITIES, ...LIFE_COMMUNITIES]

/** Canonical community slug → Korean display name mapping */
export const COMMUNITY_NAMES: Record<string, string> = {
  ...Object.fromEntries(ALL_COMMUNITIES.map((c) => [c.slug, c.name])),
  // Legacy slugs (마이그레이션 호환)
  "overseas-football": "축구",
  "domestic-football": "축구",
  esports: "게임",
  tips: "자유",
  free: "자유",
  soccer: "축구",
}
