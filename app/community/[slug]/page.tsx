import type { Metadata } from "next"
import { Header } from "@/components/header"
import { NewsTicker } from "@/components/news-ticker"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { CommunityContent } from "@/components/community-content"
import { createServerAnonClient } from "@/lib/supabase"
import { jsonLd } from "@/lib/seo"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatMemberCount } from "@/lib/utils/format"

const COMMUNITY_DATA: Record<
  string,
  {
    name: string
    description: string
    memberCount: number
    banner: string
    emoji: string
  }
> = {
  "overseas-football": {
    name: "해외축구",
    description: "EPL, 라리가, 세리에A, 분데스리가 등 해외 축구 리그 정보와 분석",
    memberCount: 1245000,
    banner: "/placeholder.jpg",
    emoji: "⚽",
  },
  "domestic-football": {
    name: "국내축구",
    description: "K리그, 국가대표, 국내 축구 소식과 경기 분석",
    memberCount: 453000,
    banner: "/placeholder.jpg",
    emoji: "🏟️",
  },
  baseball: {
    name: "야구",
    description: "KBO, MLB 야구 정보, 경기 분석, 선수 이야기",
    memberCount: 982000,
    banner: "/placeholder.jpg",
    emoji: "⚾",
  },
  basketball: {
    name: "농구",
    description: "NBA, KBL 농구 소식, 경기 분석, 선수 정보",
    memberCount: 387000,
    banner: "/placeholder.jpg",
    emoji: "🏀",
  },
  volleyball: {
    name: "배구",
    description: "V리그 남녀 배구 경기 정보와 분석",
    memberCount: 221000,
    banner: "/placeholder.jpg",
    emoji: "🏐",
  },
  esports: {
    name: "e스포츠",
    description: "LCK, 발로란트, 오버워치 등 e스포츠 경기 분석",
    memberCount: 671000,
    banner: "/placeholder.jpg",
    emoji: "🎮",
  },
  "free-board": {
    name: "자유게시판",
    description: "자유롭게 이야기 나누는 공간, 잡담과 유머",
    memberCount: 894000,
    banner: "/placeholder.jpg",
    emoji: "💬",
  },
  tips: {
    name: "정보게시판",
    description: "베팅 팁, 분석 노하우, 유용한 정보 공유",
    memberCount: 342000,
    banner: "/placeholder.jpg",
    emoji: "📊",
  },
  movies: {
    name: "영화",
    description: "영화 리뷰, 추천, 박스오피스, 신작 소식과 토론",
    memberCount: 567000,
    banner: "/placeholder.jpg",
    emoji: "🎬",
  },
}

// Supabase에서 게시글 가져오기
async function fetchPosts(communitySlug: string) {
  const supabase = createServerAnonClient()

  // 1. 게시글 조회
  const { data: posts, error } = await supabase
    .from("posts")
    .select(`
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
    `)
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
function transformPosts(posts: {
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
}[]) {
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const communityData = COMMUNITY_DATA[slug]
  const name = communityData?.name || slug
  return {
    title: name,
    description: communityData?.description,
    openGraph: {
      title: `${name} - FanRanker`,
      description: communityData?.description,
    },
    alternates: { canonical: `/community/${slug}` },
  }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const communityData = COMMUNITY_DATA[slug]
  const community = communityData
    ? {
        name: communityData.name,
        description: communityData.description,
        members: formatMemberCount(communityData.memberCount),
        banner: communityData.banner,
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

  const currentCommunityData = COMMUNITY_DATA[slug]

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NewsTicker communitySlug={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: currentCommunityData?.name || slug,
          description: currentCommunityData?.description,
        })}}
      />
      {/* 메인 컨테이너: 1280px 최대, 중앙 정렬, 네이버 스타일 패딩 */}
      <main id="main-content" className="container mx-auto px-4 py-6 max-w-[1280px]" tabIndex={-1}>
        {/* 12컬럼 그리드: 조밀한 간격 */}
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          <div className="col-span-12 lg:col-span-9">
            <CommunityContent community={community} posts={communityPosts} communitySlug={slug} />
          </div>

          <aside className="hidden lg:block lg:col-span-3">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
