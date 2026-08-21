import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { ThreadMatchWidgets } from "@/components/match/thread-match-widgets"
import { PostDetailContent } from "@/components/post-detail/post-detail-content"
import { ArticleNextNav } from "@/components/post-detail/article-next-nav"
import {
  SagaContextBanner,
  type SagaContextItem,
} from "@/components/post-detail/saga-context-banner"
import { BoardRecentPosts } from "@/components/board-recent-posts"
import { BackButton } from "@/components/back-button"
import { createServerAnonClient } from "@/lib/supabase"
import { auth } from "@clerk/nextjs/server"
import { fetchVisibleComments } from "@/lib/comments/visible-comments"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchVsPoll } from "@/lib/news/vs-issue"
import { renderTipTapToHTML } from "@/lib/tiptap/render-html"
import { computeTemperature } from "@/lib/temperature"
import { jsonLd } from "@/lib/seo"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { isBotUserId } from "@/lib/constants/bot-users"
import { getCachedRecentComments } from "@/lib/home/cached-home-data"
import { formatRelativeTime } from "@/lib/utils/date"

// Supabase에서 글 상세 정보 가져오기
async function fetchPost(id: string) {
  const supabase = createServerAnonClient()

  // 1. 게시글 조회
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      `
      id,
      user_id,
      community_slug,
      title,
      content,
      image,
      view_count,
      vote_count,
      comment_count,
      temperature,
      created_at,
      updated_at,
      source_url,
      source_name,
      match_game_id,
      flair_id
    `
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (postError || !post) {
    return null
  }

  // 2. 작성자 프로필 + 장착 칭호 조회
  // Note: 조회수 증가는 클라이언트에서 /api/posts/[id]/view 엔드포인트를 호출하여 처리
  const [{ data: profile }, { data: equippedTitles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .eq("user_id", post.user_id)
      .single(),
    supabase
      .from("user_equipped_titles")
      .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
      .eq("user_id", post.user_id)
      .eq("board_slug", post.community_slug),
  ])

  const equipped = (equippedTitles?.[0] || null) as {
    adj_titles: unknown
    noun_titles: unknown
  } | null
  const adjTitlesRaw = equipped?.adj_titles as
    | { title: string; rarity: string }[]
    | { title: string; rarity: string }
    | null
  const adjTitle = adjTitlesRaw
    ? Array.isArray(adjTitlesRaw)
      ? adjTitlesRaw[0]
      : adjTitlesRaw
    : null
  const nounTitlesRaw = equipped?.noun_titles as { title: string }[] | { title: string } | null
  const nounTitle = nounTitlesRaw
    ? Array.isArray(nounTitlesRaw)
      ? nounTitlesRaw[0]
      : nounTitlesRaw
    : null

  return {
    ...post,
    profile: profile || null,
    titleDisplay: equipped
      ? {
          adjTitle: adjTitle?.title || null,
          nounTitle: nounTitle?.title || null,
          rarity: (adjTitle?.rarity as "common" | "rare" | "epic" | "legendary") || null,
        }
      : null,
  }
}

async function fetchBoardRecentPosts(communitySlug: string, excludePostId: string) {
  const supabase = createServerAnonClient()
  const { data } = await supabase
    .from("posts")
    .select("id, title, comment_count, vote_count, created_at")
    .eq("community_slug", communitySlug)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(16)

  if (!data) return []
  return data
    .filter((p: { id: string }) => p.id !== excludePostId)
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      title: p.title,
      comment_count: p.comment_count ?? 0,
      vote_count: p.vote_count ?? 0,
      created_at: p.created_at,
      profile: null,
    }))
}

/**
 * 봇 기사 하단용 — 전 판 최근 댓글 달린 글 (2026-08-20 담벼락 동선).
 * 홈과 같은 60초 Data Cache(getCachedRecentComments)를 나눠 쓴다 — 이 페이지도
 * 매 요청 렌더라 무캐시 왕복을 새로 늘리면 안 된다 (cached-home-data 상단 경고).
 * 행 형식은 BoardRecentPosts 계약에 맞춘다: vote_count 0 → 새 0카운트 숨김이 받는다.
 */
async function fetchWallActivityPosts(excludePostId: string) {
  const rows = (await getCachedRecentComments()) as {
    id: string
    title: string
    community_slug: string
    comment_count?: number
    last_comment_at?: string
    created_at: string
  }[]
  return rows
    .filter((p) => p.id !== excludePostId)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      title: p.title,
      comment_count: p.comment_count ?? 0,
      vote_count: 0,
      created_at: p.last_comment_at ?? p.created_at,
      profile: null,
      community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    }))
}

/** 이 글이 속한 사가 (연표 링크 기준). 없으면 빈 배열 — 카드 미노출 */
async function fetchLinkedSagas(postId: string): Promise<SagaContextItem[]> {
  const supabase = createServiceRoleClient()
  const { data: links } = await supabase
    .from("saga_article_links")
    .select("saga_id")
    .eq("post_id", postId)
    .limit(3)
  if (!links?.length) return []
  const { data: sagas } = await supabase
    .from("sagas")
    .select("slug, title, saga_type, stage, entry_count")
    .in(
      "id",
      links.map((l) => l.saga_id)
    )
  return (sagas ?? []) as SagaContextItem[]
}

async function fetchComments(postId: string) {
  // 비밀댓글 필터를 SSR/클라 API가 공유(단일 출처). 원글 작성자·운영자는 초기 렌더에서도
  // 비밀댓글을 본다. auth() 로 현재 뷰어를 넘겨 권한 판정.
  const { userId } = await auth()
  return fetchVisibleComments(postId, userId ?? null)
}

function extractDescription(content: unknown): string {
  if (!content) return ""
  // Supabase jsonb columns return parsed objects, not strings
  const parsed =
    typeof content === "string"
      ? (() => {
          try {
            return JSON.parse(content)
          } catch {
            return null
          }
        })()
      : content
  if (parsed && typeof parsed === "object") {
    const texts: string[] = []
    interface TipTapNode {
      text?: string
      content?: TipTapNode[]
    }
    function walk(node: TipTapNode) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(walk)
    }
    walk(parsed)
    const plain = texts.join(" ").replace(/\s+/g, " ").trim()
    return plain.length > 160 ? plain.slice(0, 157) + "..." : plain
  }
  if (typeof content === "string") {
    const plain = content
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
    return plain.length > 160 ? plain.slice(0, 157) + "..." : plain
  }
  return ""
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const post = await fetchPost(id)

  // 글이 없으면 metadata 시점에 notFound() — title이 "게시글 | gongnori.fan"로
  // 엉뚱하게 노출되는 SEO 문제 방지. not-found.tsx 메타데이터가 적용됨.
  if (!post) {
    notFound()
  }

  const description = extractDescription(post.content)
  return {
    title: post.title || "게시글",
    description,
    openGraph: {
      type: "article",
      title: post.title,
      description,
      images: post.image ? [post.image] : undefined,
    },
    twitter: {
      card: post.image ? "summary_large_image" : "summary",
      title: post.title || "게시글",
      description,
      images: post.image ? [post.image] : undefined,
    },
    alternates: { canonical: `/post/${id}` },
  }
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Supabase에서 글 데이터 가져오기
  const postData = await fetchPost(id)

  if (!postData) {
    notFound()
  }

  // 사가 앵커 글은 문서 페이지가 정본 — 직접 URL 접근을 /saga/[slug]로 돌린다.
  // 보드 slug 로 먼저 거르므로 일반 글에는 추가 쿼리 0회.
  if (postData.community_slug === "saga") {
    const { data: saga } = await createServiceRoleClient()
      .from("sagas")
      .select("slug")
      .eq("anchor_post_id", id)
      .maybeSingle()
    if (saga) redirect(`/saga/${saga.slug}`)
  }

  const { userId: viewerId } = await auth()
  // 봇 기사 하단은 같은 판 최근 글이 **또 봇 기사**라 미끼→미끼 순환이었다 (2026-08-20).
  // 기사를 다 읽은 최고 의도 순간에 전 판 "최근 댓글 달린 글"(=사람 활동)로 잇는다.
  // 사람 글은 현행 유지 — 같은 판 문맥이 유효하다.
  const botArticle = isBotUserId(postData.user_id)
  const [recentPosts, commentsData, vsPoll, linkedSagas, threadKickoff] = await Promise.all([
    botArticle ? fetchWallActivityPosts(id) : fetchBoardRecentPosts(postData.community_slug, id),
    fetchComments(id),
    // VS 쟁점 폴 (뉴스 게시물에만 존재) — 없으면 null, 실패해도 글은 뜬다
    fetchVsPoll(createServiceRoleClient(), id, null).catch(() => null),
    // 이 글이 속한 사가 — 실패해도 글은 뜬다
    fetchLinkedSagas(id).catch(() => []),
    // 불판 킥오프 시각 (A2 폴링 창 판정용) — 실패해도 글은 뜬다, 폴링만 꺼질 뿐
    postData.match_game_id
      ? (async () => {
          const { data } = await createServiceRoleClient()
            .from("betman_games")
            .select("match_time")
            .eq("id", postData.match_game_id as string)
            .maybeSingle()
          return data?.match_time ? new Date(data.match_time).getTime() : null
        })().catch(() => null)
      : Promise.resolve(null),
  ])
  // 기사 상세 종단 내비 (2026-08-21 데드엔드 리포트 Top5-3) — 봇 기사만.
  // 같은 말머리 관련 3건 + 다음 1건 (같은 말머리 우선 → 아무 봇 기사 → 없음).
  // 48h 창 — 낡은 기사로 잇지 않는다. 실패해도 글은 뜬다.
  let articleNav: {
    related: { id: string; title: string; comments: number }[]
    next: { id: string; title: string; comments: number } | null
  } | null = null
  if (botArticle) {
    try {
      const nav = createServiceRoleClient()
      const flairId = (postData as { flair_id?: string | null }).flair_id ?? null
      const since = new Date(Date.now() - 48 * 3600_000).toISOString()
      const base = () =>
        nav
          .from("posts")
          .select("id, title, comment_count, created_at")
          .eq("user_id", postData.user_id)
          .is("deleted_at", null)
          .neq("id", id)
          .gte("created_at", since)
      const [rel, nextSame, nextAny] = await Promise.all([
        flairId
          ? base().eq("flair_id", flairId).order("created_at", { ascending: false }).limit(4)
          : Promise.resolve({ data: [] as never[] }),
        flairId
          ? base()
              .eq("flair_id", flairId)
              .lt("created_at", postData.created_at)
              .order("created_at", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] as never[] }),
        base()
          .lt("created_at", postData.created_at)
          .order("created_at", { ascending: false })
          .limit(1),
      ])
      const toNav = (r: { id: string; title: string; comment_count: number | null }) => ({
        id: String(r.id),
        title: String(r.title),
        comments: r.comment_count ?? 0,
      })
      const next = (nextSame.data?.[0] ?? nextAny.data?.[0]) as
        | { id: string; title: string; comment_count: number | null }
        | undefined
      const nextNav = next ? toNav(next) : null
      const related = (
        (rel.data ?? []) as { id: string; title: string; comment_count: number | null }[]
      )
        .filter((r) => r.id !== nextNav?.id)
        .slice(0, 3)
        .map(toNav)
      articleNav = { related, next: nextNav }
    } catch {
      articleNav = null
    }
  }

  // 불판 댓글 라이브 폴링 (2026-08-20 UX 패널 A2) — initialData 경로는 재조회가 없어
  // 경기 중 댓글이 동결됐다. 킥오프 30분 전 ~ 3시간 후(연장·승부차기 여유)만 40초 폴링.
  const now = Date.now()
  const commentsPollMs =
    threadKickoff && now >= threadKickoff - 30 * 60_000 && now <= threadKickoff + 180 * 60_000
      ? 40_000
      : undefined
  // 내 투표는 별도 확인 (viewerId 가 있을 때만 — fetchVsPoll 결과에서 찾는다)
  if (vsPoll && viewerId) {
    vsPoll.myKey = vsPoll.voterMap[viewerId] ?? null
  }
  const boardName = COMMUNITY_NAMES[postData.community_slug] || postData.community_slug

  // 데이터 변환 (반감기 적용 온도 포함)
  const post = {
    id: postData.id,
    community: COMMUNITY_NAMES[postData.community_slug] || postData.community_slug,
    communitySlug: postData.community_slug,
    author: postData.profile?.nickname || "익명",
    avatar: postData.profile?.avatar_url || "/placeholder-user.jpg",
    userId: postData.user_id, // Clerk user_id 추가
    timestamp: formatRelativeTime(new Date(postData.created_at)),
    title: postData.title,
    content: postData.content, // TipTap JSON
    image: postData.image,
    upvotes: postData.vote_count || 0,
    comments: postData.comment_count || 0,
    temperature:
      postData.temperature ||
      computeTemperature({
        vote_count: postData.vote_count || 0,
        comment_count: postData.comment_count || 0,
        created_at: postData.created_at,
      }),
    isUpvoted: false,
    createdAt: new Date(postData.created_at),
    titleDisplay: postData.titleDisplay || null,
    sourceUrl: postData.source_url,
    sourceName: postData.source_name,
  }

  // 본문 서버 HTML — 첫 HTML 부터 본문을 실어 검색엔진·저속망에 도달시킨다
  // (문자열 본문은 클라이언트가 <p> 로 직접 그리므로 JSON 본문만)
  const contentHtml =
    typeof postData.content === "object" ? renderTipTapToHTML(postData.content) : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: postData.title,
            datePublished: postData.created_at,
            dateModified: postData.updated_at,
            author: { "@type": "Person", name: postData.profile?.nickname || "익명" },
            ...(postData.image ? { image: postData.image } : {}),
          }),
        }}
      />

      <div className="worldcup-scope min-h-[100dvh]">
        <main
          id="main-content"
          className="container mx-auto max-w-[1280px] px-4 py-6"
          tabIndex={-1}
        >
          <div className="grid grid-cols-12 gap-6">
            {/* Main Content - 9 columns */}
            <div className="col-span-12 space-y-4 lg:col-span-9">
              <BackButton fallbackHref={`/community/${postData.community_slug}`} />

              {/* Post Detail Content */}
              <PostDetailContent
                post={post}
                initialCommentsData={commentsData}
                vsPoll={vsPoll}
                contentHtml={contentHtml}
                commentsPollMs={commentsPollMs}
                // 불판 전광판 — 게시물 카드 안(제목 아래)에 (2026-08-20 운영자:
                // "상단에 있으니 게시물 글이 안 보여"). 실패해도 글은 뜬다
                scoreboard={
                  postData.match_game_id ? (
                    <Suspense fallback={null}>
                      <ThreadMatchWidgets gameId={postData.match_game_id as string} />
                    </Suspense>
                  ) : undefined
                }
              />

              {/* 이 글이 속한 사가 — 본문을 다 읽은 자리에서 연대기로 잇는다 */}
              <SagaContextBanner sagas={linkedSagas} />

              {/* Board Recent Posts — 봇 기사면 전 판 담벼락 활동으로 (위 botArticle 주석) */}
              <BoardRecentPosts
                posts={recentPosts}
                boardName={boardName}
                boardSlug={postData.community_slug}
                currentPostId={id}
                title={botArticle ? "지금 담벼락에서" : undefined}
                moreHref={botArticle ? "/?tab=board" : undefined}
                utmSource={botArticle ? "wall_now" : undefined}
              />

              {/* 뉴스→뉴스 사슬 — 사람 활동 블록(위) 다음의 바닥 안전망 (Top5-3) */}
              {articleNav && <ArticleNextNav related={articleNav.related} next={articleNav.next} />}
            </div>

            {/* Right Sidebar - 3 columns - Only recent comments */}
            <aside className="col-span-3 hidden lg:block">
              <ActivitySidebar />
            </aside>
          </div>
        </main>
      </div>
    </>
  )
}
