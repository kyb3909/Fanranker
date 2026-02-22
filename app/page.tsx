"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Header } from "@/components/header"
import { PostCard, type TipTapNode } from "@/components/post-card"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { PredictionActivityCard } from "@/components/prediction-activity-card"
import { useIdentity } from "@/components/identity-provider"
import { Dices, Flame, Clock, Loader2, Compass, Newspaper, Trophy, Palette, Heart, Eye, MessageSquare } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { IS_SPORTS, IS_CULTURE } from "@/lib/site-config"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatCount } from "@/lib/utils/format"

const BettingPage = dynamic(
  () => import("@/components/betting-page"),
  {
    loading: () => (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
)

type SortType = "random" | "hot" | "new"
type TabType = "feed" | "content"

interface Post {
  id: string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | TipTapNode // TipTap JSON or string
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  createdAt: Date
}

// --- 문화 피드용 Mock 아트워크 ---
const GRADIENTS = [
  "from-zinc-800 via-neutral-700 to-stone-800",
  "from-red-950 via-rose-900 to-red-950",
  "from-slate-800 via-slate-700 to-zinc-800",
  "from-stone-800 via-neutral-700 to-stone-900",
  "from-neutral-800 via-zinc-700 to-neutral-900",
  "from-red-900/80 via-stone-800 to-neutral-800",
  "from-zinc-700 via-stone-700 to-neutral-800",
  "from-stone-900 via-zinc-800 to-stone-900",
]

interface FeedArtwork {
  id: string
  title: string
  artist: string
  artistAvatar: string
  likes: number
  views: number
  comments: number
  gradient: string
  aspectRatio: number
}

const MOCK_FOLLOWED_ARTWORKS: FeedArtwork[] = [
  { id: "1", title: "숲속의 수호자", artist: "ArtistKim", artistAvatar: "K", likes: 342, views: 1820, comments: 28, gradient: GRADIENTS[0], aspectRatio: 1.4 },
  { id: "3", title: "사이버 전사", artist: "NeonDraw", artistAvatar: "N", likes: 489, views: 2650, comments: 42, gradient: GRADIENTS[2], aspectRatio: 1.2 },
  { id: "5", title: "드래곤 나이트", artist: "FantasyKing", artistAvatar: "F", likes: 612, views: 3200, comments: 56, gradient: GRADIENTS[4], aspectRatio: 1.5 },
  { id: "7", title: "마법소녀 변신", artist: "MagicPen", artistAvatar: "M", likes: 445, views: 2100, comments: 38, gradient: GRADIENTS[6], aspectRatio: 1.3 },
  { id: "10", title: "달빛 아래 여우", artist: "MoonlitArt", artistAvatar: "M", likes: 523, views: 2800, comments: 45, gradient: GRADIENTS[7], aspectRatio: 1.25 },
  { id: "13", title: "엘프 궁수", artist: "FantasyKing", artistAvatar: "F", likes: 378, views: 1900, comments: 31, gradient: GRADIENTS[0], aspectRatio: 1.35 },
  { id: "17", title: "사무라이 혼", artist: "BushidoArt", artistAvatar: "B", likes: 534, views: 2900, comments: 48, gradient: GRADIENTS[3], aspectRatio: 1.0 },
  { id: "15", title: "전투 메카", artist: "MechaPilot", artistAvatar: "M", likes: 412, views: 2300, comments: 35, gradient: GRADIENTS[5], aspectRatio: 1.15 },
]

function FeedArtworkCard({ artwork }: { artwork: FeedArtwork }) {
  return (
    <div className="break-inside-avoid mb-2 sm:mb-3 group">
      <Link href={`/art/${artwork.id}`} className="block">
        <div className="relative overflow-hidden rounded-lg cursor-pointer">
          <div
            className={`relative bg-gradient-to-br ${artwork.gradient} w-full`}
            style={{ paddingBottom: `${artwork.aspectRatio * 100}%` }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Palette className="w-12 h-12 text-white" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white font-semibold text-[13px] leading-tight line-clamp-1 drop-shadow-sm">{artwork.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-5 h-5 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-[9px] text-white font-bold">
                    {artwork.artistAvatar}
                  </div>
                  <span className="text-white/90 text-xs drop-shadow-sm">{artwork.artist}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-white/80">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Heart className="h-3 w-3" />
                    {formatCount(artwork.likes)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <Eye className="h-3 w-3" />
                    {formatCount(artwork.views)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <MessageSquare className="h-3 w-3" />
                    {artwork.comments}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const { isSignedIn } = useAuth()
  const { identity } = useIdentity()
  const searchParams = useSearchParams()
  const isPredictionView = searchParams.get('view') === 'prediction'
  const [activeTab, setActiveTab] = useState<TabType>("feed")
  const [sortBy, setSortBy] = useState<SortType>("hot")
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [followedCommunities, setFollowedCommunities] = useState<Set<string>>(new Set())
  const [followsLoaded, setFollowsLoaded] = useState(false)

  // 로그인 유저의 팔로우 커뮤니티 로드
  useEffect(() => {
    if (!isSignedIn) {
      setFollowsLoaded(true)
      return
    }
    fetch("/api/community/follows")
      .then((res) => res.ok ? res.json() : { communities: [] })
      .then((data) => {
        const slugs = new Set<string>(
          (data.communities || []).map((c: { community_slug: string }) => c.community_slug)
        )
        setFollowedCommunities(slugs)
      })
      .catch(() => setFollowedCommunities(new Set()))
      .finally(() => setFollowsLoaded(true))
  }, [isSignedIn])

  // 콘텐츠 탭 상태
  const [activities, setActivities] = useState<{
    id: string
    user_id: string
    round_id: string
    sport: string
    prediction_count: number
    created_at: string
    profile: { nickname: string; avatar_url: string | null }
    stats: { accuracy: number; net_profit: number; current_streak: number } | null
    round: { year: number; round: number; status: string } | null
    is_purchased: boolean
    is_free?: boolean
    predictions: { id: string; game_id: string; prediction: string; status: string; game: { home_team_name: string; away_team_name: string; match_time: string; game_type: string; sport: string; result: string | null } }[] | null
  }[]>([])
  const [isContentLoading, setIsContentLoading] = useState(false)
  const [contentLoaded, setContentLoaded] = useState(false)

  // 아이덴티티 변경 시 콘텐츠 탭 데이터 리셋
  useEffect(() => {
    setContentLoaded(false)
  }, [identity])

  // Supabase에서 글 목록 가져오기
  useEffect(() => {
    async function fetchPosts() {
      setIsLoading(true)
      try {
        const sortParam = sortBy === "hot" ? "hot" : sortBy === "random" ? "new" : "new"
        const response = await fetch(`/api/posts?sort=${sortParam}&limit=50`)

        if (!response.ok) {
          throw new Error('글 목록을 가져오는데 실패했습니다.')
        }

        const { posts: fetchedPosts, profiles } = await response.json()

        // 프로필 매핑
        const profileMap = new Map<string, { user_id: string; nickname: string; avatar_url: string | null }>(profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [p.user_id, p]) || [])

        // 데이터 변환: 팔로우한 커뮤니티가 있으면 필터링, 없으면 전체 표시
        const hasFollows = followedCommunities.size > 0
        const transformedPosts: Post[] = fetchedPosts
          .filter((post: { community_slug: string }) => !hasFollows || followedCommunities.has(post.community_slug))
          .map((post: { id: string; user_id: string; community_slug: string; title: string; content: string | TipTapNode; image?: string; vote_count?: number; comment_count?: number; created_at: string }) => {
            const profile = profileMap.get(post.user_id)
            return {
              id: post.id,
              community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
              communitySlug: post.community_slug,
              author: profile?.nickname || "익명",
              avatar: profile?.avatar_url || "/placeholder-user.jpg",
              userId: post.user_id, // Clerk user_id 추가
              timestamp: formatRelativeTime(new Date(post.created_at)),
              title: post.title,
              content: post.content, // TipTap JSON
              image: post.image,
              upvotes: post.vote_count || 0,
              comments: post.comment_count || 0,
              isUpvoted: false,
              createdAt: new Date(post.created_at),
            }
          })

        setPosts(transformedPosts)
      } catch {
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    if (followsLoaded) fetchPosts()
  }, [sortBy, followedCommunities, followsLoaded])

  // 콘텐츠 탭 데이터 로드
  const fetchActivities = useCallback(async () => {
    if (!isSignedIn) return
    setIsContentLoading(true)
    try {
      const response = await fetch('/api/feed/predictions?limit=20')
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
      }
    } catch {
      setActivities([])
    } finally {
      setIsContentLoading(false)
      setContentLoaded(true)
    }
  }, [isSignedIn])

  useEffect(() => {
    if (activeTab === 'content' && !contentLoaded && (identity === 'sports' || identity === 'hybrid')) {
      fetchActivities()
    }
    if (activeTab === 'content' && identity === 'culture') {
      setContentLoaded(true)
    }
  }, [activeTab, contentLoaded, fetchActivities, identity])

  // 예측 구매 핸들러
  const handlePurchase = async (activityId: string) => {
    try {
      const response = await fetch('/api/predictions/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: activityId }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || '구매에 실패했습니다.')
        return null
      }
      // 무료 열람이 아닌 경우에만 골드 잔액 업데이트
      if (!data.is_free) {
        window.dispatchEvent(new Event('goldBalanceUpdate'))
      }
      return data.predictions || null
    } catch {
      alert('구매 중 오류가 발생했습니다.')
      return null
    }
  }

  // 정렬
  const sortedPosts = [...posts].sort((a, b) => {
    switch (sortBy) {
      case "random":
        return Math.random() - 0.5
      case "hot":
        return b.upvotes - a.upvotes
      case "new":
        return b.createdAt.getTime() - a.createdAt.getTime()
      default:
        return 0
    }
  })

  // 사이트 모드별 콘텐츠 탭 라벨/아이콘
  const contentTabLabel = IS_CULTURE ? '아티스트' : identity === 'culture' ? '아티스트' : '승부 예측'
  const ContentTabIcon = IS_CULTURE ? Palette : identity === 'culture' ? Palette : Trophy

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* 메인 컨테이너: Threads 스타일 중앙 정렬 */}
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        {/* 12컬럼 그리드: Threads 스타일 간격 */}
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <CommunitySidebar />
          </aside>

          {/* Main Content - 6 columns */}
          <div className="col-span-12 lg:col-span-6 space-y-4">

            {/* ===== 승부 예측 뷰 ===== */}
            {IS_SPORTS && isPredictionView ? (
              <BettingPage />
            ) : (
            <>
            {/* ===== 탭 네비게이션 ===== */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveTab("feed")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold transition-all ${
                    activeTab === "feed"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Newspaper className="w-4 h-4 shrink-0" />
                  피드
                </button>
                <button
                  onClick={() => setActiveTab("content")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold transition-all ${
                    activeTab === "content"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ContentTabIcon className="w-4 h-4 shrink-0" />
                  {contentTabLabel}
                </button>
              </div>

              {/* 피드 탭: 정렬 바 */}
              {activeTab === "feed" && (
                <div className="flex items-center justify-center px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => setSortBy("random")}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                        sortBy === "random"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Dices className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      랜덤
                    </button>
                    <button
                      onClick={() => setSortBy("hot")}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                        sortBy === "hot"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Flame className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      온도순
                    </button>
                    <button
                      onClick={() => setSortBy("new")}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                        sortBy === "new"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      최신순
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 피드 탭 콘텐츠 */}
            {activeTab === "feed" && (
              <div className="space-y-3">
                {isLoading ? (
                  <div className="bg-card border border-border rounded-lg p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">글 목록을 불러오는 중...</p>
                  </div>
                ) : sortedPosts.length > 0 ? (
                  sortedPosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))
                ) : (
                  <div className="bg-card border border-border rounded-lg p-8 text-center">
                    <Compass className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">
                      {followedCommunities.size > 0
                        ? "팔로우한 게시판에 게시물이 없습니다."
                        : "아직 게시물이 없습니다."}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {followedCommunities.size > 0
                        ? "다른 게시판도 팔로우해보세요!"
                        : "게시판에서 첫 번째 글을 작성해보세요."}
                    </p>
                    <Link
                      href="/explore"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      <Compass className="w-4 h-4" />
                      게시판 탐색하기
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* ===== 콘텐츠 탭: 아이덴티티별 분기 ===== */}
            {activeTab === "content" && (
              <div className="space-y-3">

                {/* --- 스포츠: 승부 예측 --- */}
                {(identity === 'sports' || identity === 'hybrid') && (
                  <>
                    {!isSignedIn ? (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          로그인하면 팔로우한 랭커의 예측 콘텐츠를 확인할 수 있습니다.
                        </p>
                      </div>
                    ) : isContentLoading ? (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">예측 콘텐츠를 불러오는 중...</p>
                      </div>
                    ) : activities.length > 0 ? (
                      activities.map((activity) => (
                        <PredictionActivityCard
                          key={activity.id}
                          activity={activity}
                          onPurchase={handlePurchase}
                        />
                      ))
                    ) : (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">
                          랭커를 팔로우하면 예측 콘텐츠가 여기에 표시됩니다
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                          승부예측 랭킹에서 랭커를 팔로우해보세요.
                        </p>
                        <Link
                          href="/games/prediction"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          <Trophy className="w-4 h-4" />
                          랭킹 보러 가기
                        </Link>
                      </div>
                    )}
                  </>
                )}

                {/* --- 하이브리드: 승부 예측 뒤에 구분선 --- */}
                {identity === 'hybrid' && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 border-t border-border" />
                    <span className="text-xs text-muted-foreground font-medium">구독 아티스트</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                )}

                {/* --- 문화 / 하이브리드: 구독 아티스트 이미지 --- */}
                {(identity === 'culture' || identity === 'hybrid') && (
                  <>
                    {!isSignedIn ? (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          로그인하면 구독한 아티스트의 작품을 확인할 수 있습니다.
                        </p>
                      </div>
                    ) : MOCK_FOLLOWED_ARTWORKS.length > 0 ? (
                      <div className="columns-2 gap-2 sm:gap-3">
                        {MOCK_FOLLOWED_ARTWORKS.map((artwork) => (
                          <FeedArtworkCard key={artwork.id} artwork={artwork} />
                        ))}
                      </div>
                    ) : (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <Palette className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">
                          아티스트를 팔로우하면 작품이 여기에 표시됩니다
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                          아트 갤러리에서 마음에 드는 아티스트를 팔로우해보세요.
                        </p>
                        <Link
                          href="/art"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          <Palette className="w-4 h-4" />
                          아트 갤러리 가기
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            </>
            )}
          </div>

          {/* Right Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
