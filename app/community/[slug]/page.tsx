import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NewsTicker } from "@/components/news-ticker"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { CommunityContent } from "@/components/community-content"
import { createServerAnonClient } from "@/lib/supabase"
import { jsonLd } from "@/lib/seo"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatMemberCount } from "@/lib/utils/format"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import Link from "next/link"

/** slug → community info lookup (from centralized constants) */
const COMMUNITY_MAP = Object.fromEntries(ALL_COMMUNITIES.map((c) => [c.slug, c]))

/** Member counts (placeholder until real analytics) */
const MEMBER_COUNTS: Record<string, number> = {
  football: 1245000,
  baseball: 982000,
  basketball: 387000,
  volleyball: 221000,
  game: 671000,
  movies: 567000,
  music: 432000,
  idol: 789000,
  anime: 345000,
  "free-board": 894000,
}

const POSTS_PER_PAGE = 25

// Supabase에서 게시글 가져오기
async function fetchPosts(communitySlug: string, page: number = 1) {
  const supabase = createServerAnonClient()

  const offset = (page - 1) * POSTS_PER_PAGE

  // 1. 게시글 조회 (count 포함)
  const {
    data: posts,
    error,
    count,
  } = await supabase
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
      created_at
    `,
      { count: "exact" }
    )
    .eq("community_slug", communitySlug)
    .is("deleted_at", null)
    .order("is_notice", { ascending: false }) // 공지 먼저
    .order("created_at", { ascending: false }) // 최신순
    .range(offset, offset + POSTS_PER_PAGE - 1)

  if (error) {
    console.error("Failed to fetch posts:", error)
    return { posts: [], totalCount: 0 }
  }

  if (!posts || posts.length === 0) return { posts: [], totalCount: count || 0 }

  // 2. 작성자 프로필 조회
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nickname, avatar_url, temperature")
    .in("user_id", userIds)

  // 3. 프로필 매핑
  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

  return {
    posts: posts.map((post) => {
      const profile = profileMap.get(post.user_id) || null
      return {
        ...post,
        profile: profile || null,
        author: profile?.nickname || "익명",
        avatar: profile?.avatar_url || "/placeholder-user.jpg",
        authorTemperature: profile?.temperature ?? 0,
        userId: post.user_id,
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
    profile?: { nickname?: string; avatar_url?: string | null } | null
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
    }
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const info = COMMUNITY_MAP[slug]
  const name = info?.name || slug
  const description =
    info?.metaDescription || info?.description || `${name} 게시판 - FanRanker 커뮤니티`
  return {
    title: name,
    description,
    keywords: info?.keywords,
    openGraph: {
      title: `${name} - FanRanker`,
      description,
    },
    twitter: {
      card: "summary",
      title: `${name} - FanRanker`,
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
  searchParams: Promise<{ page?: string }>
}) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10) || 1)

  const info = COMMUNITY_MAP[slug]

  // 존재하지 않는 커뮤니티 → 404
  if (!info) {
    notFound()
  }

  const community = {
    name: info.name,
    description: info.description,
    members: formatMemberCount(MEMBER_COUNTS[slug] || 0),
    banner: "/placeholder.jpg",
  }

  // 하위 채널 목록 조회
  const supabaseForChannels = createServerAnonClient()
  const { data: channels } = await supabaseForChannels
    .from("categories")
    .select("slug, name, icon, description")
    .eq("parent_slug", slug)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  // Supabase에서 실제 데이터 가져오기
  const { posts: rawPosts, totalCount } = await fetchPosts(slug, currentPage)
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
      <main id="main-content" className="container mx-auto max-w-[1280px] px-4 py-6" tabIndex={-1}>
        {/* 12컬럼 그리드: 조밀한 간격 */}
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-12 lg:col-span-9">
            {/* 하위 채널 목록 */}
            {channels && channels.length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {channels.map((ch) => (
                  <Link
                    key={ch.slug}
                    href={`/community/${ch.slug}`}
                    className="bg-card border-border hover:border-primary/50 hover:bg-muted/50 flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors"
                  >
                    <span className="bg-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded text-base">
                      {ch.icon || "📺"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-[13px] font-semibold">
                        {ch.name}
                      </p>
                      {ch.description && (
                        <p className="text-muted-foreground truncate text-[11px]">
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
            />
          </div>

          <aside className="hidden lg:col-span-3 lg:block">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </>
  )
}
