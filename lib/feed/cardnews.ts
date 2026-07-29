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
  /** VS 쟁점 (히어로 카드용) — 질문 + 양측 라벨 + 퍼센트. 폴 없으면 undefined */
  vs?: { question: string; aLabel: string; bLabel: string; aPct: number; total: number }
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

  const cards = await buildCards(supabase, rows)

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

/** 내부 행 타입 — posts select 결과 (fetchCardNews / fetchHeroCards 공유) */
interface PostRow {
  id: string
  title: string
  image: string | null
  content: unknown
  vote_count: number | null
  comment_count: number | null
  created_at: string
  post_flairs:
    | { name: string; color: string | null }
    | { name: string; color: string | null }[]
    | null
}

/** posts 행 → CardNewsItem 변환 (댓글 미리보기 + 닉네임 병합 포함) */
async function buildCards(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rows: PostRow[]
): Promise<CardNewsItem[]> {
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

  return rows.map((p) => {
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
}

/**
 * 홈 히어로(Top Story) — 레딧에서 실제로 불타오른 순.
 *
 * 화력 = VPS 스캐너가 15분마다 재측정해 news_reservoir.raw.heat 에 넣는
 * { score(업보트), comments } (POST /api/news/heat). 발행 48시간 내 글을
 * 화력순으로 세운다. 화력 데이터가 아직 없으면(측정 전) 빈 배열 —
 * 호출부(app/page.tsx)가 최신순 폴백으로 채운다.
 */
export async function fetchHeroCards(limit = 3): Promise<CardNewsItem[]> {
  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

  const { data: hot } = await supabase
    .from("news_reservoir")
    .select("publish, raw")
    .eq("status", "published")
    .gte("created_at", cutoff)
    .not("raw->heat", "is", null)
    .limit(60)

  // 화력 유효기간 3시간 — 스캐너(15분 주기)가 재측정을 멈춘 글 = 레딧 목록에서
  // 빠진 글 = 식은 글. 마지막 측정값으로 히어로에 눌러앉지 않게 무효 처리한다.
  const staleCutoff = Date.now() - 3 * 3600 * 1000

  const ranked = (hot ?? [])
    .map((r) => {
      const pub = r.publish as { post_id?: string } | null
      const heat = (r.raw as { heat?: { score?: number; comments?: number; at?: string } } | null)
        ?.heat
      const measuredAt = heat?.at ? new Date(heat.at).getTime() : 0
      return {
        postId: pub?.post_id,
        score: measuredAt > staleCutoff ? (heat?.score ?? 0) : 0,
        comments: measuredAt > staleCutoff ? (heat?.comments ?? 0) : 0,
      }
    })
    .filter(
      (r): r is { postId: string; score: number; comments: number } => !!r.postId && r.score > 0
    )
    // 화력 = 업보트 + 댓글×2 — 댓글이 "불타오름"의 더 강한 신호 (논쟁도 환호도 댓글로 남는다)
    .sort((a, b) => b.score + b.comments * 2 - (a.score + a.comments * 2))
    .slice(0, limit * 2) // 이미지 없는 글이 걸러질 수 있어 여유분

  if (ranked.length === 0) return []

  const { data: posts } = await supabase
    .from("posts")
    .select(
      // post_flairs 임베드는 !flair_id 힌트 필수 (post_flair_map 추가 후 관계 모호 — f15c802a 참조)
      "id, title, image, content, vote_count, comment_count, created_at, post_flairs!flair_id ( name, color )"
    )
    .in(
      "id",
      ranked.map((r) => r.postId)
    )
    .is("deleted_at", null)

  const order = new Map(ranked.map((r, i) => [r.postId, i]))
  const rows = ((posts ?? []) as unknown as PostRow[]).sort(
    (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)
  )
  const cards = await buildCards(supabase, rows)
  // 히어로는 전면 이미지 카드 — 이미지 없는 글은 성립 안 함
  const heroes = cards.filter((c) => !!c.image).slice(0, limit)
  await attachVsToCards(supabase, heroes)
  return heroes
}

/** 히어로 카드에 VS 쟁점(질문+퍼센트) 부착 — 폴 없는 글은 그대로 둔다 */
async function attachVsToCards(
  supabase: ReturnType<typeof createServiceRoleClient>,
  cards: CardNewsItem[]
): Promise<void> {
  if (cards.length === 0) return
  const { data: polls } = await supabase
    .from("polls")
    .select("id, post_id, question, options, is_active")
    .in(
      "post_id",
      cards.map((c) => c.id)
    )
    .eq("is_active", true)
  if (!polls || polls.length === 0) return

  const { data: votes } = await supabase
    .from("poll_votes")
    .select("poll_id, option_key")
    .in(
      "poll_id",
      polls.map((p) => p.id)
    )
    .limit(5000)

  for (const poll of polls) {
    const card = cards.find((c) => c.id === poll.post_id)
    const opts = (poll.options as { key: string; label: string }[]) ?? []
    if (!card || opts.length < 2) continue
    const pollVotes = (votes ?? []).filter((v) => v.poll_id === poll.id)
    const aCount = pollVotes.filter((v) => v.option_key === opts[0].key).length
    const total = pollVotes.length
    card.vs = {
      question: poll.question,
      aLabel: opts[0].label,
      bLabel: opts[1].label,
      // 표가 없으면 50:50 (빈 게이지는 죽어 보인다)
      aPct: total === 0 ? 50 : Math.round((aCount / total) * 100),
      total,
    }
  }
}
