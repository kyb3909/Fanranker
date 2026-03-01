import type { Metadata } from "next"
import { Header } from "@/components/header"
import { NewsTicker } from "@/components/news-ticker"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { CommunityContent } from "@/components/community-content"
import { createServerAnonClient } from "@/lib/supabase"
import { jsonLd } from "@/lib/seo"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatMemberCount } from "@/lib/utils/format"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"

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

// Supabase에서 게시글 가져오기
async function fetchPosts(communitySlug: string) {
  const supabase = createServerAnonClient()

  // 1. 게시글 조회
  const { data: posts, error } = await supabase
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
    `
    )
    .eq("community_slug", communitySlug)
    .is("deleted_at", null)
    .order("is_notice", { ascending: false }) // 공지 먼저
    .order("created_at", { ascending: false }) // 최신순

  if (error) {
    console.error("Failed to fetch posts:", error)
    return []
  }

  if (!posts || posts.length === 0) return []

  // 2. 작성자 프로필 조회
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nickname, avatar_url, temperature")
    .in("user_id", userIds)

  // 3. 프로필 매핑
  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

  return posts.map((post) => {
    const profile = profileMap.get(post.user_id) || null
    return {
      ...post,
      profile: profile || null,
      author: profile?.nickname || "익명",
      avatar: profile?.avatar_url || "/placeholder-user.jpg",
      authorTemperature: profile?.temperature ?? 0,
      userId: post.user_id,
    }
  })
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

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const info = COMMUNITY_MAP[slug]
  const community = info
    ? {
        name: info.name,
        description: info.description,
        members: formatMemberCount(MEMBER_COUNTS[slug] || 0),
        banner: "/placeholder.jpg",
      }
    : {
        name: slug,
        description: "커뮤니티 설명",
        members: "0명",
        banner: "/placeholder.svg",
      }

  // Supabase에서 실제 데이터 가져오기
  const rawPosts = await fetchPosts(slug)
  const communityPosts = transformPosts(rawPosts)

  return (
    <div className="bg-background min-h-screen">
      <Header />
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
            <CommunityContent community={community} posts={communityPosts} communitySlug={slug} />
          </div>

          <aside className="hidden lg:col-span-3 lg:block">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
