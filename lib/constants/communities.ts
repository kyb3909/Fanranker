/** Community definition with display metadata */
export interface CommunityInfo {
  slug: string
  name: string
  emoji: string
  description: string
  /** SEO-optimized long description for meta tags */
  metaDescription?: string
  /** SEO keywords */
  keywords?: string[]
}

/** 스포츠 게시판 */
export const SPORTS_COMMUNITIES: CommunityInfo[] = [
  {
    slug: "football",
    name: "축구",
    emoji: "⚽",
    description: "K리그, EPL, 라리가, 세리에A 등 국내외 축구 소식과 분석",
    metaDescription:
      "K리그, EPL, 라리가, 세리에A, 분데스리가, 챔피언스리그 등 국내외 축구 뉴스, 경기 분석, 이적 소식, 승부예측을 한곳에서. FanRanker 축구 게시판",
    keywords: [
      "축구",
      "EPL",
      "K리그",
      "라리가",
      "챔피언스리그",
      "축구 분석",
      "축구 커뮤니티",
      "승부예측",
    ],
  },
  {
    slug: "baseball",
    name: "야구",
    emoji: "⚾",
    description: "KBO, MLB 야구 정보, 경기 분석, 선수 이야기",
    metaDescription:
      "KBO 프로야구, MLB 메이저리그 경기 결과, 선수 분석, 순위, 이적 소식과 승부예측. FanRanker 야구 게시판",
    keywords: ["야구", "KBO", "MLB", "프로야구", "야구 분석", "야구 커뮤니티", "승부예측"],
  },
  {
    slug: "basketball",
    name: "농구",
    emoji: "🏀",
    description: "NBA, KBL 농구 소식, 경기 분석, 선수 정보",
    metaDescription:
      "NBA, KBL 프로농구 경기 분석, 선수 스탯, 순위, 트레이드 소식과 승부예측. FanRanker 농구 게시판",
    keywords: ["농구", "NBA", "KBL", "프로농구", "농구 분석", "농구 커뮤니티"],
  },
  {
    slug: "volleyball",
    name: "배구",
    emoji: "🏐",
    description: "V리그 남녀 배구 경기 정보와 분석",
    metaDescription:
      "V리그 남녀 프로배구 경기 일정, 결과, 선수 분석, 순위와 팬 토론. FanRanker 배구 게시판",
    keywords: ["배구", "V리그", "프로배구", "배구 분석", "배구 커뮤니티"],
  },
]

/** 라이프 게시판 */
export const LIFE_COMMUNITIES: CommunityInfo[] = [
  {
    slug: "game",
    name: "게임",
    emoji: "🎮",
    description: "PC, 모바일, 콘솔 게임 소식과 e스포츠 이야기",
    metaDescription:
      "PC, 모바일, PS5, 닌텐도 게임 리뷰, 공략, e스포츠 소식과 게이머 커뮤니티. FanRanker 게임 게시판",
    keywords: ["게임", "PC게임", "모바일게임", "e스포츠", "게임 리뷰", "게임 커뮤니티"],
  },
  {
    slug: "movies",
    name: "영화",
    emoji: "🎬",
    description: "영화 리뷰, 추천, 박스오피스, 신작 소식과 토론",
    metaDescription:
      "최신 영화 리뷰, 박스오피스 순위, 넷플릭스·디즈니+ 추천, 영화 토론과 평점. FanRanker 영화 게시판",
    keywords: ["영화", "영화 리뷰", "박스오피스", "넷플릭스", "영화 추천", "영화 커뮤니티"],
  },
  {
    slug: "music",
    name: "음악",
    emoji: "🎵",
    description: "K-POP, 힙합, 인디, 해외 음악 소식과 추천",
    metaDescription:
      "K-POP, 힙합, 인디, 팝 음악 신곡, 앨범 리뷰, 차트, 콘서트 소식과 음악 토론. FanRanker 음악 게시판",
    keywords: ["음악", "K-POP", "힙합", "인디음악", "음악 추천", "음악 커뮤니티"],
  },
  {
    slug: "idol",
    name: "아이돌",
    emoji: "🎤",
    description: "아이돌 컴백, 팬캠, 팬미팅, 덕질 이야기",
    metaDescription:
      "K-POP 아이돌 컴백, 팬캠, 음방, 팬미팅, 콘서트 소식과 덕질 커뮤니티. FanRanker 아이돌 게시판",
    keywords: ["아이돌", "K-POP", "팬캠", "컴백", "아이돌 커뮤니티", "덕질"],
  },
  {
    slug: "anime",
    name: "애니",
    emoji: "🤖",
    description: "애니메이션 추천, 리뷰, 신작 소식과 토론",
    metaDescription:
      "일본 애니메이션 신작, 추천, 리뷰, 만화 소식과 오타쿠 커뮤니티. FanRanker 애니 게시판",
    keywords: ["애니", "애니메이션", "만화", "일본 애니", "애니 추천", "애니 커뮤니티"],
  },
  {
    slug: "free-board",
    name: "자유",
    emoji: "💬",
    description: "자유롭게 이야기 나누는 공간, 잡담과 유머",
    metaDescription: "자유로운 주제로 대화하는 잡담, 유머, 일상 이야기 공간. FanRanker 자유 게시판",
    keywords: ["자유게시판", "잡담", "유머", "일상", "커뮤니티"],
  },
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
