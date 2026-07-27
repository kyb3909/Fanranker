import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  extractFirstImageSrcFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"

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
  /** 상위 댓글 미리보기 (추천순 최대 3개) — 카드 안 공방 미리보기용 */
  topComments: { nickname: string; content: string }[]
  /** 대표 말머리 (팀 우선) — 상단 태그 칩용 */
  flair: { name: string; color: string | null } | null
  /** 본문 첫 임베드 (플랫폼 뱃지 + 유튜브 lite embed 용). 풀 임베드는 상세 페이지 몫 */
  media: { provider: "youtube" | "instagram" | "x"; url: string; videoId?: string } | null
}

const PAGE_SIZE = 20
const SOURCE_RE = /^\[([^\]]{1,24})\]\s*/

/** AI 뉴스룸 발행 계정 (news-review publish) — 카드뉴스는 이 계정 글만 큐레이션 */
const NEWS_BOT_USER_ID = "user_bot_soccer_kr"

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
    .select(
      // post_flairs 임베드는 !flair_id 힌트 필수 (post_flair_map 추가 후 관계 모호 — f15c802a 참조)
      "id, title, image, content, vote_count, comment_count, created_at, post_flairs!flair_id ( name, color )"
    )
    .is("deleted_at", null)
    .eq("user_id", NEWS_BOT_USER_ID)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt("created_at", before)

  const { data: posts, error } = await query
  if (error) throw error
  const rows = posts ?? []

  // 댓글 있는 글만 조회 → post별 추천순 상위 3개 + 작성자 닉네임 (공방 미리보기)
  const withComments = rows.filter((p) => (p.comment_count ?? 0) > 0).map((p) => p.id)
  const topOf = new Map<string, { user_id: string; content: string }[]>()
  const nickOf = new Map<string, string>()
  if (withComments.length > 0) {
    const { data: comments } = await supabase
      .from("comments")
      .select("post_id, user_id, content")
      .in("post_id", withComments)
      .is("deleted_at", null)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(300)
    for (const c of comments ?? []) {
      const list = topOf.get(c.post_id) ?? []
      if (list.length < 3) {
        list.push({ user_id: c.user_id, content: c.content })
        topOf.set(c.post_id, list)
      }
    }
    // 닉네임 병합 (comments↔profiles 는 FK 임베드 불가 — 별도 조회)
    const uids = [...new Set([...topOf.values()].flat().map((c) => c.user_id))]
    if (uids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", uids)
      for (const p of profiles ?? []) nickOf.set(p.user_id, p.nickname)
    }
  }

  const cards: CardNewsItem[] = rows.map((p) => {
    const m = p.title.match(SOURCE_RE)
    // 생성 타입은 임베드를 배열로 추론하지만 단일 FK 관계라 런타임은 객체 — 둘 다 수용
    const f = Array.isArray(p.post_flairs) ? p.post_flairs[0] : p.post_flairs

    const emb = extractFirstEmbedFromTipTapJSON(p.content)
    let media: CardNewsItem["media"] = null
    if (emb) {
      const videoId =
        emb.attrs.provider === "youtube"
          ? (emb.attrs.url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1] ??
            undefined)
          : undefined
      media = { provider: emb.attrs.provider, url: emb.attrs.url, videoId }
    }
    // 썸네일 우선순위: image 컬럼 → 본문 첫 이미지 → 유튜브 썸네일
    const image =
      p.image ??
      extractFirstImageSrcFromTipTapJSON(p.content) ??
      (media?.videoId ? `https://img.youtube.com/vi/${media.videoId}/hqdefault.jpg` : null)
    return {
      id: p.id,
      title: m ? p.title.slice(m[0].length) : p.title,
      source: m ? m[1] : null,
      image,
      media,
      voteCount: p.vote_count ?? 0,
      commentCount: p.comment_count ?? 0,
      createdAt: p.created_at,
      topComments: (topOf.get(p.id) ?? []).map((c) => ({
        nickname: nickOf.get(c.user_id) ?? "익명",
        content: toPreview(c.content),
      })),
      flair: f ? { name: f.name, color: f.color } : null,
    }
  })

  return {
    // 사진 없는 글은 떡밥에서 배제한다 (2026-07-28).
    // 카드뉴스는 전면 오버레이(사진 위 제목)라 이미지가 없으면 카드가 성립하지 않는다.
    // image 는 image 컬럼 → 본문 첫 이미지 → 유튜브 썸네일 순으로 이미 폴백되므로,
    // 여기서 걸러지는 건 인스타/X 임베드만 있는 글과 순수 텍스트 글이다.
    cards: cards.filter((c) => !!c.image),
    // 커서는 필터 전 rows 기준 — 걸러진 글도 "읽은" 것으로 쳐야 다음 페이지가 밀리지 않는다.
    nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null,
  }
}
