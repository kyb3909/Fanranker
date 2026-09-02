import { isBotUserId, SOCCER_MEME_BOT_USER_ID } from "@/lib/constants/bot-users"

/**
 * 홈 "인기 게시글" 풀 (2026-09-03 운영자: "전체 보기에서는 진짜 인기 게시물 몇 개만, 뉴스를
 * 끄면 인기 게시물이 쫙 — SNS·인스타그램처럼").
 *
 * 떡밥(봇 뉴스) 사이에 끼는 담벼락 카드와, 뉴스를 끈 스트림이 **같은 풀**을 쓴다. 풀이
 * 하나여야 "전체에서 본 그 글이 뉴스를 끄면 맨 위에 있다"가 성립한다.
 *
 * 점수는 단순 가산이다 — 온도(temperature)는 트래픽 0 에서 전부 0 이라 정렬이 안 된다
 * (2026-08-12 패널 판정). 추천·댓글이 주인공이고, 미디어와 신선도는 콜드스타트 보정이다:
 * 아무도 안 누른 새 글도 며칠은 올라와야 "빈 SNS"가 안 된다.
 */
export interface PopularPost {
  id: string
  title: string
  communitySlug: string
  userId: string
  author: string
  avatar: string | null
  /** 본문 첫 이미지 (동영상 글이면 포스터로 쓴다) */
  image: string | null
  /** 본문 첫 동영상 — 있으면 카드에서 바로 재생 */
  video: string | null
  /** 미디어 없는 글의 본문 앞부분 (140자) */
  excerpt: string | null
  upvotes: number
  comments: number
  createdAt: string
}

export interface PopularPostRow {
  id: string
  title: string
  community_slug: string
  user_id: string
  image: string | null
  video: string | null
  vote_count: number | null
  comment_count: number | null
  created_at: string
  last_comment_at: string | null
}

const HOUR = 3600_000

/** 풀에 드는 작성자 — 사람 + 축구밈봇. 뉴스봇·중계불판·시드봇은 뺀다 (떡밥의 주인공이거나 매치센터 안에 산다) */
export function isPopularPoolAuthor(userId: string): boolean {
  return userId === SOCCER_MEME_BOT_USER_ID || !isBotUserId(userId)
}

export function popularScore(row: PopularPostRow, now: number): number {
  const up = row.vote_count ?? 0
  const comments = row.comment_count ?? 0
  const ageH = Math.max(0, (now - Date.parse(row.created_at)) / HOUR)
  const media = row.image || row.video ? 2 : 0
  // 72시간에 걸쳐 6 → 0. 추천 2개(=6점)와 맞먹는 출발점 — 새 글이 이틀은 버틴다
  const fresh = Math.max(0, 6 - ageH / 12)
  const lastComment = row.last_comment_at ? Date.parse(row.last_comment_at) : NaN
  const talking = Number.isFinite(lastComment) && now - lastComment < 24 * HOUR ? 2 : 0
  return up * 3 + comments * 2 + media + fresh + talking
}

/** 점수 내림차순, 동점이면 최신순. 풀 밖 작성자(봇)는 여기서 걸러진다 */
export function rankPopularPosts<T extends PopularPostRow>(rows: T[], now = Date.now()): T[] {
  return rows
    .filter((r) => isPopularPoolAuthor(r.user_id))
    .map((r) => ({ r, s: popularScore(r, now) }))
    .sort((a, b) => b.s - a.s || b.r.created_at.localeCompare(a.r.created_at))
    .map((x) => x.r)
}
