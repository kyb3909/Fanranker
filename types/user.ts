/** 칭호 표시 정보 (공유 타입) */
export interface TitleDisplay {
  adjTitle?: string | null
  nounTitle?: string | null
  rarity?: "common" | "rare" | "epic" | "legendary" | null
}

/** 기본 프로필 정보 (API 응답 공통) */
export interface BaseProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
}

/** 장착된 칭호 정보 (API 응답) */
export interface EquippedTitle {
  user_id: string
  board_slug: string
  adj_titles: { title: string; rarity: string } | null
  noun_titles: { title: string } | null
}
