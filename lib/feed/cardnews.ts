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
  /** 작성자 닉네임 — 컴팩트 카드의 "글쓴이" 표기용 (2026-08-03) */
  author: string | null
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
  /** VS 쟁점 — 질문 + 양측 + 퍼센트. 카드에서 바로 투표 가능 (폴 없으면 undefined) */
  vs?: {
    pollId: string
    question: string
    aKey: string
    aLabel: string
    bKey: string
    bLabel: string
    aPct: number
    total: number
  }
}

/** 떡밥 자격 시간창 — 이보다 오래된 글은 피드에서 내린다 (2026-08-03 운영자: 36시간) */
const FEED_WINDOW_HOURS = 36
/** 36시간 × 봇 발행량(하루 ~20건)이면 한 번에 다 담긴다 — 커서 페이지네이션 불필요 */
const FEED_LIMIT = 60
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
 * 카드뉴스 피드 데이터 (2026-08-03 운영자 개편).
 *
 * - **36시간 창**: 그보다 오래된 떡밥은 내린다 — 떡밥은 신선도가 생명.
 * - **온도순**: posts.temperature(pg_cron 매분 갱신 — 댓글이 계속 달리는 글이 높음)
 *   내림차순. "계속 싸우고 있는 글"이 위로 온다.
 * - **단일 페이지**: 36h × 봇 발행량이면 60건 안에 다 들어온다. 온도순은 커서
 *   페이지네이션이 성립하지 않으므로(순위가 매분 변함) 한 번에 담고 커서는 항상 null.
 *   `before` 인자는 기존 API 계약 호환용으로만 남긴다 — 값이 오면 빈 페이지 반환.
 */
export async function fetchCardNews(
  before?: string | null
): Promise<{ cards: CardNewsItem[]; nextCursor: string | null }> {
  // 온도순 단일 페이지 체제에서 커서 요청 = 이미 전부 내려준 뒤 → 즉시 끝
  if (before) return { cards: [], nextCursor: null }

  const supabase = createServiceRoleClient()
  const windowStart = new Date(Date.now() - FEED_WINDOW_HOURS * 3600 * 1000).toISOString()

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      // post_flairs 임베드는 !flair_id 힌트 필수 (post_flair_map 추가 후 관계 모호 — f15c802a 참조)
      "id, user_id, title, image, content, vote_count, comment_count, created_at, post_flairs!flair_id ( name, color )"
    )
    .is("deleted_at", null)
    .eq("user_id", NEWS_BOT_USER_ID)
    .gte("created_at", windowStart)
    .order("temperature", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT)
  if (error) throw error
  const rows = (posts ?? []) as unknown as PostRow[]

  const cards = await buildCards(supabase, rows)
  // 떡밥 카드에서 바로 투표 (안 1, 2026-07-31) — 쇼윈도 표면이라 높은 바:
  // confidence >= 0.7 이고 켜진 폴만 (본문 하단은 켜진 것 전부 — fetchVsPoll 몫)
  await attachVsToCards(supabase, cards)

  return {
    // 사진 없는 글은 떡밥에서 배제한다 (2026-07-28 규칙 유지).
    // image 는 image 컬럼 → 본문 첫 이미지 → 유튜브 썸네일 순으로 폴백되므로,
    // 여기서 걸러지는 건 인스타/X 임베드만 있는 글과 순수 텍스트 글이다.
    cards: cards.filter((c) => !!c.image),
    nextCursor: null,
  }
}

/** 내부 행 타입 — posts select 결과 (fetchCardNews / fetchHeroCards 공유) */
interface PostRow {
  id: string
  user_id: string
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
  }

  // 닉네임 병합 (comments/posts↔profiles 는 FK 임베드 불가 — 별도 조회).
  // 댓글 작성자 + 글 작성자("글쓴이" 표기, 2026-08-03)를 한 쿼리로.
  const uids = [
    ...new Set([
      ...[...topOf.values()].flat().map((c) => c.user_id),
      ...rows.map((p) => p.user_id),
    ]),
  ]
  if (uids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", uids)
    for (const p of profiles ?? []) nickOf.set(p.user_id, p.nickname)
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
      author: nickOf.get(p.user_id) ?? null,
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
 * 홈 히어로(Top Story) — **운영자 수동 큐레이션** (2026-08-03 개편).
 *
 * 이전엔 레딧 화력(news_reservoir.raw.heat) 자동 순위였으나, "메인에 올리는 건
 * 내가 선택하는 것만"(운영자)으로 전환. posts.hero_pinned_at 이 걸린 글을 최근
 * 고정 순으로 올린다 — 글 상세의 관리자 전용 "메인 걸기" 버튼이 유일한 진입.
 * 고정 글이 없으면 빈 배열 → 호출부(app/page.tsx)가 최신 이미지 카드 폴백으로
 * 채운다(핀 지정 전 빈 히어로 방지 — 하나라도 걸면 픽만 노출).
 */
export async function fetchHeroCards(limit = 3): Promise<CardNewsItem[]> {
  const supabase = createServiceRoleClient()

  const { data: posts } = await supabase
    .from("posts")
    .select(
      // post_flairs 임베드는 !flair_id 힌트 필수 (post_flair_map 추가 후 관계 모호 — f15c802a 참조)
      "id, user_id, title, image, content, vote_count, comment_count, created_at, post_flairs!flair_id ( name, color )"
    )
    .is("deleted_at", null)
    .not("hero_pinned_at", "is", null)
    .order("hero_pinned_at", { ascending: false })
    .limit(limit * 2) // 이미지 없는 글이 걸러질 수 있어 여유분

  const rows = (posts ?? []) as unknown as PostRow[]
  if (rows.length === 0) return []

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
  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, post_id, question, options, is_active, confidence")
    .in(
      "post_id",
      cards.map((c) => c.id)
    )
    .eq("is_active", true)
  // 쇼윈도(피드/히어로) 바: confidence 0.7 미만은 본문에서만.
  // confidence null = 초기 백필분 — 사람 손정리를 거친 것만 남으므로 통과.
  const polls = (pollRows ?? []).filter((p) => p.confidence === null || Number(p.confidence) >= 0.7)
  if (polls.length === 0) return

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
      pollId: poll.id,
      question: poll.question,
      aKey: opts[0].key,
      aLabel: opts[0].label,
      bKey: opts[1].key,
      bLabel: opts[1].label,
      // 표가 없으면 50:50 (빈 게이지는 죽어 보인다)
      aPct: total === 0 ? 50 : Math.round((aCount / total) * 100),
      total,
    }
  }
}
