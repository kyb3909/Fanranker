import { createServiceRoleClient } from "@/lib/supabase/server"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"

export interface CardNewsItem {
  id: string
  /** [출처] 프리픽스가 제거된 제목 */
  title: string
  /** 제목 앞 [대괄호] 출처 텍스트 (없으면 null) */
  source: string | null
  image: string | null
  voteCount: number
  commentCount: number
  createdAt: string
  /** 최고 추천 댓글 한 줄 (없으면 null) */
  bestComment: string | null
}

const PAGE_SIZE = 20
const SOURCE_RE = /^\[([^\]]{1,24})\]\s*/

/** 댓글 미리보기용 — 태그 제거 + 한 줄 길이로 자름 */
function toPreview(content: string): string {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

/**
 * 카드뉴스 피드 데이터 — 최신 글 + 카드별 베스트 댓글 1개.
 * 이미지 없는 글도 포함 (클라이언트에서 회색 플레이스홀더 렌더).
 */
export async function fetchCardNews(
  before?: string | null
): Promise<{ cards: CardNewsItem[]; nextCursor: string | null }> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from("posts")
    .select("id, title, image, content, vote_count, comment_count, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt("created_at", before)

  const { data: posts, error } = await query
  if (error) throw error
  const rows = posts ?? []

  // 댓글 있는 글만 베스트 댓글 조회 → post별 첫 행(최고 추천)만 사용
  const withComments = rows.filter((p) => (p.comment_count ?? 0) > 0).map((p) => p.id)
  const bestOf = new Map<string, string>()
  if (withComments.length > 0) {
    const { data: comments } = await supabase
      .from("comments")
      .select("post_id, content")
      .in("post_id", withComments)
      .is("deleted_at", null)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200)
    for (const c of comments ?? []) {
      if (!bestOf.has(c.post_id)) bestOf.set(c.post_id, toPreview(c.content))
    }
  }

  const cards: CardNewsItem[] = rows.map((p) => {
    const m = p.title.match(SOURCE_RE)
    return {
      id: p.id,
      title: m ? p.title.slice(m[0].length) : p.title,
      source: m ? m[1] : null,
      // image 컬럼이 비어도 본문(TipTap) 첫 이미지를 썸네일로 사용 (더쿠/레딧 비주얼 글)
      image: p.image ?? extractFirstImageSrcFromTipTapJSON(p.content),
      voteCount: p.vote_count ?? 0,
      commentCount: p.comment_count ?? 0,
      createdAt: p.created_at,
      bestComment: bestOf.get(p.id) ?? null,
    }
  })

  return {
    cards,
    nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null,
  }
}
