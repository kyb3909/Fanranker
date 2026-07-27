import type { Metadata } from "next"
import { Suspense } from "react"
import dynamic from "next/dynamic"
import { notFound } from "next/navigation"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { CommunityContent } from "@/components/community-content"

const NewsTicker = dynamic(
  () => import("@/components/news-talk/news-ticker").then((m) => ({ default: m.NewsTicker })),
  // Skeleton 높이를 실제 ticker 렌더 높이에 맞춤: 모바일 ~64px (item min-h-11 + py), 데스크톱 ~44px.
  // 베이스 h-16 (64px) 만 두면 lg 에서 64→43 충돌로 CLS 발생.
  { loading: () => <div className="wc-skeleton h-16 rounded-xl lg:h-11" /> }
)
import { createServerAnonClient } from "@/lib/supabase"
import { jsonLd } from "@/lib/seo"
import { formatRelativeTime } from "@/lib/utils/date"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import Link from "@/components/ui/app-link"
import { getCreator } from "@/lib/constants/creators"
import { CreatorBoard } from "@/components/creator/creator-board"
import { SectionHeader } from "@/components/section-header"

// ISR: 30초 캐시 + stale-while-revalidate
export const revalidate = 30

/** slug → community info lookup (from centralized constants) */
const COMMUNITY_MAP = Object.fromEntries(ALL_COMMUNITIES.map((c) => [c.slug, c]))

const POSTS_PER_PAGE = 25

// Supabase에서 게시글 가져오기
async function fetchPosts(communitySlug: string, page: number = 1, flairId?: string) {
  const supabase = createServerAnonClient()

  const offset = (page - 1) * POSTS_PER_PAGE

  // 1. 게시글 조회 (count 포함)
  let query = supabase
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
      is_notice,
      created_at,
      flair_id,
      post_flairs!flair_id ( id, name, color )
    `,
      { count: "exact" }
    )
    .eq("community_slug", communitySlug)
    .is("deleted_at", null)

  if (flairId) {
    query = query.eq("flair_id", flairId)
  }

  const {
    data: posts,
    error,
    count,
  } = await query
    .order("is_notice", { ascending: false }) // 공지 먼저
    .order("created_at", { ascending: false }) // 최신순
    .range(offset, offset + POSTS_PER_PAGE - 1)

  if (error) {
    console.error("Failed to fetch posts:", error)
    return { posts: [], totalCount: 0 }
  }

  if (!posts || posts.length === 0) return { posts: [], totalCount: count || 0 }

  // 2. 작성자 프로필 + 장착 칭호 조회
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const [{ data: profiles }, { data: equippedTitles }] = await Promise.all([
    supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
    supabase
      .from("user_equipped_titles")
      .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
      .in("user_id", userIds),
  ])

  // 3. 프로필 + 칭호 매핑
  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])
  type EquippedTitle = {
    user_id: string
    board_slug: string
    adj_titles: unknown
    noun_titles: unknown
  }
  const titleMap = new Map(
    ((equippedTitles || []) as EquippedTitle[]).map((t) => [`${t.user_id}:${t.board_slug}`, t])
  )

  return {
    posts: posts.map((post) => {
      const profile = profileMap.get(post.user_id) || null
      const equipped = titleMap.get(`${post.user_id}:${post.community_slug}`)
      const adjTitles = equipped?.adj_titles as
        | { title: string; rarity: string }[]
        | { title: string; rarity: string }
        | null
      const adjTitle = Array.isArray(adjTitles) ? adjTitles[0] : adjTitles
      const nounTitles = equipped?.noun_titles as { title: string }[] | { title: string } | null
      const nounTitle = Array.isArray(nounTitles) ? nounTitles[0] : nounTitles
      return {
        ...post,
        profile: profile || null,
        author: profile?.nickname || "익명",
        avatar: profile?.avatar_url || "/placeholder-user.jpg",
        userId: post.user_id,
        titleDisplay: equipped
          ? {
              adjTitle: adjTitle?.title || null,
              nounTitle: nounTitle?.title || null,
              rarity: adjTitle?.rarity || null,
            }
          : null,
      }
    }),
    totalCount: count || 0,
  }
}

// DB 데이터를 컴포넌트 형식으로 변환 (반감기 적용 온도 포함)
function transformPosts(
  posts: {
    id: string
    user_id: string
    community_slug: string
    title: string
    content: unknown
    image?: string
    view_count?: number
    vote_count?: number
    comment_count?: number
    temperature?: number
    is_notice?: boolean
    created_at: string
    flair_id?: string | null
    post_flairs?:
      | { id: string; name: string; color: string }
      | { id: string; name: string; color: string }[]
      | null
    profile?: { nickname?: string; avatar_url?: string | null } | null
    titleDisplay?: {
      adjTitle?: string | null
      nounTitle?: string | null
      rarity?: string | null
    } | null
  }[]
) {
  return posts.map((post) => {
    const temperature = post.temperature ?? 0
    return {
      id: post.id,
      community: post.community_slug,
      communitySlug: post.community_slug,
      author: post.profile?.nickname || "익명",
      avatar: post.profile?.avatar_url || "/placeholder-user.jpg",
      userId: post.user_id, // Clerk user_id 추가
      timestamp: formatRelativeTime(new Date(post.created_at)),
      title: post.title,
      content: post.content,
      image: post.image,
      upvotes: post.vote_count || 0,
      comments: post.comment_count || 0,
      views: post.view_count || 0,
      temperature,
      rating: Math.min(5, Math.max(1, Math.floor(temperature / 20) + 1)),
      isNotice: post.is_notice || false,
      isUpvoted: false,
      createdAt: new Date(post.created_at),
      flair: Array.isArray(post.post_flairs)
        ? post.post_flairs[0] || null
        : post.post_flairs || null,
      titleDisplay: post.titleDisplay || null,
    }
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const creator = getCreator(slug)
  if (creator) {
    return {
      title: creator.name,
      description: creator.description || `${creator.name} - gongnori.fan`,
      alternates: { canonical: `/community/${creator.slug}` },
    }
  }
  const info = COMMUNITY_MAP[slug]
  let name = info?.name
  let description: string | undefined =
    info?.metaDescription ||
    info?.description ||
    (name ? `${name} 게시판 - gongnori.fan 커뮤니티` : undefined)

  // DB fallback for dynamic categories (하위 채널 등)
  if (!info) {
    const supabase = createServerAnonClient()
    const { data: cat } = await supabase
      .from("categories")
      .select("name, description")
      .eq("slug", slug)
      .single()
    if (cat) {
      name = cat.name
      description = cat.description || `${name} 게시판 - gongnori.fan 커뮤니티`
    } else {
      // COMMUNITY_MAP + DB 모두 없음 → notFound()로 not-found.tsx 메타데이터 사용
      // (이전 동작: title에 slug가 그대로 노출되어 SEO 오염)
      notFound()
    }
  }
  return {
    title: name,
    description,
    keywords: info?.keywords,
    openGraph: {
      title: `${name} - gongnori.fan`,
      description,
    },
    twitter: {
      card: "summary",
      title: `${name} - gongnori.fan`,
      description,
    },
    alternates: { canonical: `/community/${slug}` },
  }
}

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; flair?: string }>
}) {
  const { slug } = await params
  const { page: pageParam, flair: flairId } = await searchParams
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10) || 1)

  // 크리에이터 보드(캣스날 등): 상단 = 유튜브 영상/공지(CreatorBoard), 하단 = 사람들의 게시판(표준 보드)
  const creator = getCreator(slug)
  if (creator) {
    const { posts: rawCreatorPosts, totalCount } = await fetchPosts(slug, currentPage, flairId)
    const creatorPosts = transformPosts(rawCreatorPosts)
    const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE)
    const creatorBoardInfo = {
      name: `${creator.name} 게시판`,
      description: "",
      banner: "/placeholder.jpg",
    }
    return (
      <div className="worldcup-scope wc-board-canvas min-h-[100dvh]">
        <main
          id="main-content"
          className="container mx-auto max-w-[1280px] px-4 py-6"
          tabIndex={-1}
        >
          <CreatorBoard creator={creator} />
          <div className="mt-6">
            <CommunityContent
              community={creatorBoardInfo}
              posts={creatorPosts}
              communitySlug={slug}
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              flairs={[]}
              hideFollowHeader
            />
          </div>
        </main>
      </div>
    )
  }

  const info = COMMUNITY_MAP[slug]

  // DB에서 카테고리 확인 (하위 채널 포함)
  const supabaseForMeta = createServerAnonClient()
  const { data: dbCategory } = await supabaseForMeta
    .from("categories")
    .select("slug, name, description, icon, parent_slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single()

  // 상수에도 DB에도 없으면 404
  if (!info && !dbCategory) {
    notFound()
  }

  const communityName = info?.name || dbCategory?.name || slug
  const communityDesc = info?.description || dbCategory?.description || ""

  const community = {
    name: communityName,
    description: communityDesc,
    banner: "/placeholder.jpg",
  }

  // 모든 데이터를 병렬로 가져오기 (SSR waterfall 제거)
  // recentComments 는 ActivitySidebar SSR prefetch 용 — hydration 후 client fetch 로
  // sidebar 가 채워지면서 발생하던 데스크톱 CLS 0.21+ 제거.
  const [
    { data: channels },
    { data: flairs },
    { posts: rawPosts, totalCount },
    { data: recentComments },
  ] = await Promise.all([
    supabaseForMeta
      .from("categories")
      .select("slug, name, icon, description")
      .eq("parent_slug", slug)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabaseForMeta
      .from("post_flairs")
      .select("id, name, color, sort_order")
      .eq("community_slug", slug)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    fetchPosts(slug, currentPage, flairId),
    supabaseForMeta
      .from("posts")
      .select("id, title, community_slug, comment_count, last_comment_at, created_at")
      .is("deleted_at", null)
      .gt("comment_count", 0)
      .order("last_comment_at", { ascending: false, nullsFirst: false })
      .limit(10),
  ])
  const communityPosts = transformPosts(rawPosts)
  const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE)

  return (
    <>
      <NewsTicker communitySlug={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: info?.name || slug,
            description: info?.description || `${slug} 게시판`,
          }),
        }}
      />
      {/* 메인 컨테이너: 1280px 최대, 중앙 정렬, 네이버 스타일 패딩 */}
      <div className="worldcup-scope wc-board-canvas min-h-[100dvh]">
        <main
          id="main-content"
          className="container mx-auto max-w-[1280px] px-4 py-6"
          tabIndex={-1}
        >
          {/* 12컬럼 그리드: 조밀한 간격 */}
          <div className="grid grid-cols-12 gap-4 lg:gap-5">
            <div className="col-span-12 lg:col-span-9">
              {/* 게시판 정체성 밴드 (시안 A 다크 존) — 채널 카드/목록은 아래 라이트로 유지 */}
              <SectionHeader
                label="Board"
                title={info?.name || dbCategory?.name || slug}
                description={communityDesc || undefined}
              />
              {/* 하위 채널 목록 — wc-action-card 응용. 축구는 이적시장 상황판 카드를 맨 앞에 */}
              {((channels && channels.length > 0) || slug === "football") && (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slug === "football" && (
                    <Link
                      href="/transfer"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-all hover:-translate-y-0.5"
                      style={{
                        background: "var(--wc-card)",
                        boxShadow: "var(--wc-shadow-1)",
                        // 한쪽 면 액센트 보더 금지 — 전체 테두리로 두른다
                        border: "1px solid var(--wc-line)",
                      }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-base"
                        style={{ background: "var(--wc-soft)" }}
                      >
                        🔁
                      </span>
                      <div className="min-w-0">
                        <p
                          className="truncate text-[13px] font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          이적시장
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--wc-mute)" }}>
                          오피셜·루머 상황판
                        </p>
                      </div>
                    </Link>
                  )}
                  {(channels ?? []).map((ch) => (
                    <Link
                      key={ch.slug}
                      href={`/community/${ch.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-all hover:-translate-y-0.5"
                      style={{
                        background: "var(--wc-card)",
                        boxShadow: "var(--wc-shadow-1)",
                        // 한쪽 면 액센트 보더 금지 — 전체 테두리로 두른다
                        border: "1px solid var(--wc-line)",
                      }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-base"
                        style={{ background: "var(--wc-soft)" }}
                      >
                        {ch.icon || "📺"}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="truncate text-[13px] font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {ch.name}
                        </p>
                        {ch.description && (
                          <p className="truncate text-[11px]" style={{ color: "var(--wc-mute)" }}>
                            {ch.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <CommunityContent
                community={community}
                posts={communityPosts}
                communitySlug={slug}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                flairs={flairs || []}
                activeFlairId={flairId}
              />
            </div>

            <aside className="hidden lg:col-span-3 lg:block">
              <ActivitySidebar initialRecentComments={recentComments ?? []} />
            </aside>
          </div>
        </main>
      </div>
    </>
  )
}
