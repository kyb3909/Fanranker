"use client"

import { useState, useMemo } from "react"
import useSWR, { SWRConfig } from "swr"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { Eye, MessageSquare, Loader2, ThumbsUp } from "lucide-react"
import Link from "@/components/ui/app-link"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { fetcher } from "@/lib/swr"

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
  parent_slug: string | null
}

const EXPLORE_GRID_LIMIT = 10

const CAT_CHIP_MAP: Record<string, { bg: string; color: string }> = {
  축구: { bg: "#FDECEC", color: "#9F1239" },
  야구: { bg: "#EAF1FD", color: "#1E3A8A" },
  농구: { bg: "#FDF1E5", color: "#9A3412" },
  배구: { bg: "#F4EEFB", color: "#581C87" },
  게임: { bg: "#EEF0FA", color: "#2D3A8C" },
  애니: { bg: "#EAF4F4", color: "#0F5858" },
  음악: { bg: "#FDEFF3", color: "#9F1239" },
}

interface Post {
  id: string
  title: string
  community: string
  communitySlug: string
  comments: number
  views: number
  upvotes: number
  createdAt: string
}

interface RawPost {
  id: string
  title: string
  community_slug: string
  comment_count?: number
  view_count?: number
  vote_count?: number
  created_at: string
}

function mapPosts(posts: RawPost[]): Post[] {
  return (posts || []).map((p) => ({
    id: p.id,
    title: p.title,
    community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    communitySlug: p.community_slug,
    comments: p.comment_count || 0,
    views: p.view_count || 0,
    upvotes: p.vote_count || 0,
    createdAt: p.created_at,
  }))
}

const swrOptions = { revalidateOnFocus: false, dedupingInterval: 5000 } as const

type SortTab = "upvotes" | "comments" | "views"

interface ExploreContentProps {
  fallback: Record<string, unknown>
}

export function ExploreContent({ fallback }: ExploreContentProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <ExploreInner />
    </SWRConfig>
  )
}

function ExploreInner() {
  const [sortTab, setSortTab] = useState<SortTab>("upvotes")

  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    ...swrOptions,
    dedupingInterval: 30000,
  })

  // 최근 글 50개를 가져와서 클라이언트에서 추천 10+ 필터
  const { data: postsData, isLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=new&limit=50",
    fetcher,
    swrOptions
  )

  // 게시판 둘러보기 그리드: 상위 카테고리(parent_slug=NULL)만, sort_order 순, 최대 10개.
  // /api/categories 응답에는 자식 카테고리(예: gamst → parent=football)도 섞여 있어
  // 필터링 필수. 자식은 사이드바 community-sidebar 에서 트리로 노출됨.
  const categories = (catData?.categories || [])
    .filter((c) => !c.parent_slug)
    .slice(0, EXPLORE_GRID_LIMIT)
  const allPosts = mapPosts(postsData?.posts || [])

  // 7일 이내 + 추천 1개 이상 필터
  const hotPosts = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return allPosts.filter((p) => p.upvotes >= 1 && p.createdAt >= sevenDaysAgo)
  }, [allPosts])

  // 정렬
  const sortedPosts = useMemo(() => {
    const sorted = [...hotPosts]
    switch (sortTab) {
      case "upvotes":
        return sorted.sort((a, b) => b.upvotes - a.upvotes)
      case "comments":
        return sorted.sort((a, b) => b.comments - a.comments)
      case "views":
        return sorted.sort((a, b) => b.views - a.views)
    }
  }, [hotPosts, sortTab])

  const isContentLoading = isLoading && !postsData

  const SORT_TABS: { key: SortTab; label: string; icon: typeof ThumbsUp }[] = [
    { key: "upvotes", label: "추천순", icon: ThumbsUp },
    { key: "comments", label: "댓글순", icon: MessageSquare },
    { key: "views", label: "조회순", icon: Eye },
  ]

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main id="main-content" className="container mx-auto max-w-[1280px] px-4 py-6" tabIndex={-1}>
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content */}
          <div className="col-span-12 space-y-6 xl:col-span-9">
            {/* 섹션 헤더 */}
            <div style={{ marginBottom: 4 }}>
              <div className="wc-sec-eb">Explore</div>
              <h1
                className="font-title text-[28px] font-extrabold sm:text-[34px]"
                style={{ letterSpacing: "-.03em", lineHeight: 1.15 }}
              >
                운동장
              </h1>
              <p className="mt-2 text-[14px]" style={{ color: "var(--wc-mute)", lineHeight: 1.6 }}>
                관심 있는 커뮤니티를 찾아 즐겨찾기에 추가하세요.
              </p>
            </div>

            {/* 커뮤니티 카드 그리드 */}
            {categories.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 14,
                }}
              >
                {categories.map((cat) => {
                  const chip = CAT_CHIP_MAP[cat.name] ?? { bg: "#EFF2F4", color: "#3A3D45" }
                  return (
                    <Link
                      key={cat.slug}
                      href={`/community/${cat.slug}`}
                      className="gn-card-lift flex flex-col items-start gap-2.5"
                      style={{
                        background: "var(--wc-card)",
                        border: "1px solid var(--wc-line)",
                        borderRadius: 12,
                        padding: "20px 20px 18px",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: chip.bg,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 21,
                          flexShrink: 0,
                        }}
                      >
                        {cat.icon || "📋"}
                      </span>
                      <span
                        className="font-title text-[16.5px] font-extrabold"
                        style={{ color: "var(--wc-ink)", letterSpacing: "-.01em" }}
                      >
                        {cat.name}
                      </span>
                      {cat.description && (
                        <span
                          className="text-[12.5px]"
                          style={{ color: "var(--wc-mute)", lineHeight: 1.5 }}
                        >
                          {cat.description}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}

            {/* 실시간 인기글 */}
            <div
              className="overflow-hidden rounded-xl"
              style={{
                background: "var(--wc-card)",
                boxShadow: "var(--wc-shadow-1)",
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: "var(--wc-soft)",
                  borderBottom: "1px solid var(--wc-line)",
                }}
              >
                <h2
                  className="text-[11px] font-bold uppercase"
                  style={{
                    color: "var(--wc-burgundy)",
                    letterSpacing: "0.18em",
                  }}
                >
                  실시간 인기글
                </h2>
                <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                  추천 1+ · 최근 7일
                </span>
              </div>

              {/* 정렬 탭 — wc-underline-tabs */}
              <div className="wc-underline-tabs">
                {SORT_TABS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setSortTab(key)}
                    className={sortTab === key ? "on" : ""}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              <div>
                {isContentLoading ? (
                  <div className="p-8 text-center" style={{ color: "var(--wc-mute)" }}>
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    <p className="text-sm">글 목록을 불러오는 중...</p>
                  </div>
                ) : sortedPosts.length > 0 ? (
                  sortedPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="flex items-center justify-between p-3 transition-colors"
                      style={{
                        borderBottom: "1px solid var(--wc-line)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--wc-soft)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {post.title}
                        </p>
                        <span className="mt-1 block text-xs" style={{ color: "var(--wc-mute)" }}>
                          {post.community}
                        </span>
                      </div>
                      <div className="ml-4 flex flex-shrink-0 items-center gap-3 text-xs tabular-nums">
                        <span
                          className="flex items-center gap-1 font-bold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          {post.upvotes}
                        </span>
                        <span
                          className="flex items-center gap-1"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {post.comments}
                        </span>
                        <span
                          className="flex items-center gap-1"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          <Eye className="h-3 w-3" />
                          {post.views}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-8 text-center" style={{ color: "var(--wc-mute)" }}>
                    <p className="text-sm">최근 7일 내 추천받은 게시물이 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <aside className="col-span-3 hidden xl:block">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
