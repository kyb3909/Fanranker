"use client"

import { useState, useMemo } from "react"
import useSWR, { SWRConfig } from "swr"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import {
  Eye,
  MessageSquare,
  Loader2,
  ThumbsUp,
  TrendingUp,
  ArrowRight,
  PenLine,
} from "lucide-react"
import { BoardIcon } from "@/components/sidebar/board-icon"
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

/** 게시판 카드에 얹는 글 수 (하위 채널 합산) */
export interface BoardStat {
  total: number
  today: number
}

const EXPLORE_GRID_LIMIT = 10

/** 카테고리별 아이콘 칩 틴트 — 색은 배경 틴트로만 (한쪽 면 액센트 보더 금지) */
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
  stats?: Record<string, BoardStat>
}

export function ExploreContent({ fallback, stats }: ExploreContentProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <ExploreInner stats={stats} />
    </SWRConfig>
  )
}

function ExploreInner({ stats }: { stats?: Record<string, BoardStat> }) {
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
      {/*
        다크 밴드 (시안 A) — 이 페이지의 주인공은 "게시판 디렉토리"다.
        게시판 카드는 밴드 하단에 걸치게 띄운다: 실데이터가 2~3개뿐이라 작은 칩으로
        깔면 화면에서 미아가 된다. 개수가 아니라 무게로 채운다.
      */}
      <section className="gn-band gn-band-open" aria-label="운동장">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-8 pb-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                <h1
                  className="text-[34px] leading-none sm:text-[42px]"
                  style={{
                    fontFamily: "var(--font-display-ko), var(--font-title)",
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                    color: "var(--gn-cream)",
                    textShadow: "0.5px 0 currentColor",
                  }}
                >
                  운동장
                </h1>
                <span
                  className="gn-num text-[12.5px] font-bold uppercase"
                  style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
                >
                  Explore · 게시판 디렉토리
                </span>
              </div>
              <p
                className="mt-3 max-w-[46ch] text-[14.5px]"
                style={{ color: "var(--gn-cream-dim)" }}
              >
                관심 있는 게시판을 찾아 팔로우해보세요. 팔로우한 게시판 글은 담벼락 위로 올라옵니다.
              </p>
            </div>
            {categories.length > 0 && (
              <div className="shrink-0 text-right">
                <span
                  className="gn-num block text-[34px] leading-none font-bold"
                  style={{ color: "var(--gn-cream)" }}
                >
                  {categories.length}
                </span>
                <span
                  className="gn-num mt-1.5 block text-[12px] font-bold uppercase"
                  style={{ letterSpacing: "0.18em", color: "#8d8794" }}
                >
                  Open Boards
                </span>
              </div>
            )}
          </div>

          {/* 게시판 카드 — 밴드 아래로 48px 걸침 */}
          {categories.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div
                className="relative z-[2] mb-[-48px] grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(272px, 1fr))" }}
              >
                {categories.map((cat) => {
                  const chip = CAT_CHIP_MAP[cat.name] ?? { bg: "#EFF2F4", color: "#3A3D45" }
                  const s = stats?.[cat.slug]
                  return (
                    <Link
                      key={cat.slug}
                      href={`/community/${cat.slug}`}
                      className="group flex items-start gap-3.5 rounded-[13px] p-[18px] transition-transform hover:-translate-y-1"
                      style={{
                        background: "var(--wc-card)",
                        border: "1px solid var(--wc-line)",
                        boxShadow: "0 18px 38px -18px rgba(0,0,0,.62)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px]"
                        style={{ background: chip.bg, color: chip.color }}
                      >
                        <BoardIcon slug={cat.slug} className="h-[21px] w-[21px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="font-title block text-[18px] font-extrabold"
                          style={{ color: "var(--wc-ink)", letterSpacing: "-0.025em" }}
                        >
                          {cat.name}
                        </span>
                        {cat.description && (
                          <span
                            className="mt-0.5 block truncate text-[13px] font-semibold"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            {cat.description}
                          </span>
                        )}
                        {s && (
                          <span
                            className="mt-2.5 flex gap-3.5 text-[12.5px] font-semibold"
                            style={{ color: "var(--wc-mute)" }}
                          >
                            <span>
                              오늘 글
                              <b
                                className="gn-num ml-1.5 text-[15px]"
                                style={{ color: "var(--wc-ink-2)" }}
                              >
                                {s.today.toLocaleString()}
                              </b>
                            </span>
                            <span>
                              전체
                              <b
                                className="gn-num ml-1.5 text-[15px]"
                                style={{ color: "var(--wc-ink-2)" }}
                              >
                                {s.total.toLocaleString()}
                              </b>
                            </span>
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        className="mt-3 h-[18px] w-[18px] shrink-0 self-center transition-transform group-hover:translate-x-1"
                        style={{ color: "var(--wc-mute-2)" }}
                        aria-hidden
                      />
                    </Link>
                  )
                })}
              </div>
              <div aria-hidden className="hidden lg:block" />
            </div>
          )}
        </div>
      </section>

      <main
        id="main-content"
        className="container mx-auto max-w-[1280px] px-4 pt-[72px] pb-10"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-9">
            {/* 실시간 인기글 */}
            <div
              className="overflow-hidden rounded-xl"
              style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: "var(--wc-card)", borderBottom: "1px solid var(--wc-line)" }}
              >
                <h2
                  className="flex items-center gap-2 text-[11px] font-bold uppercase"
                  style={{ color: "var(--wc-ink)", letterSpacing: "0.18em" }}
                >
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
                  실시간 인기글
                </h2>
                <span className="text-xs" style={{ color: "var(--wc-mute)" }}>
                  추천 1+ · 최근 7일
                </span>
              </div>

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
                      className="flex items-center justify-between p-3 transition-colors hover:bg-[var(--wc-soft)]"
                      style={{ borderBottom: "1px solid var(--wc-line)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {post.community && (
                            <span style={{ color: "var(--wc-burgundy)" }}>[{post.community}] </span>
                          )}
                          {post.title}
                        </p>
                      </div>
                      <div className="ml-4 flex flex-shrink-0 items-center gap-3 text-xs">
                        <span
                          className="flex items-center gap-1 font-bold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          <b className="gn-num font-bold">{post.upvotes.toLocaleString()}</b>
                        </span>
                        <span
                          className="flex items-center gap-1"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          <MessageSquare className="h-3 w-3" />
                          <b className="gn-num font-bold">{post.comments.toLocaleString()}</b>
                        </span>
                        <span
                          className="flex items-center gap-1"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          <Eye className="h-3 w-3" />
                          <b className="gn-num font-bold">{post.views.toLocaleString()}</b>
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <HotEmptyState boards={categories} />
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

/**
 * 빈 상태 — "없습니다" 한 줄로 끝내면 화면 절반이 죽는다.
 * 조건(최근 7일 추천 1개)을 설명하고, 이미 존재하는 동선(게시판 이동 / 글쓰기)으로만 되돌린다.
 */
function HotEmptyState({ boards }: { boards: Category[] }) {
  return (
    <div className="px-6 py-12 text-center">
      <span
        aria-hidden
        className="mx-auto grid h-14 w-14 place-items-center rounded-full"
        style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
      >
        <ThumbsUp className="h-6 w-6" />
      </span>
      <p
        className="font-title mt-4 text-[17px] font-extrabold"
        style={{ color: "var(--wc-ink)", letterSpacing: "-0.02em" }}
      >
        이번 주엔 아직 아무도 추천을 안 눌렀다
      </p>
      <p
        className="mx-auto mt-2 max-w-[42ch] text-[13.5px]"
        style={{ color: "var(--wc-mute)", lineHeight: 1.6, wordBreak: "keep-all" }}
      >
        여기 올라오는 조건은 하나, 최근 7일 안에 추천 1개. 읽다가 괜찮은 글 있으면 추천 한 번
        눌러주면 그 글이 바로 이 자리에 뜬다.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {boards.slice(0, 2).map((b, i) => (
          <Link
            key={b.slug}
            href={`/community/${b.slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13.5px] font-bold transition-opacity hover:opacity-90"
            style={
              i === 0
                ? { background: "var(--wc-burgundy)", color: "#fff" }
                : {
                    background: "var(--wc-card)",
                    color: "var(--wc-ink)",
                    border: "1px solid var(--wc-line)",
                  }
            }
          >
            {b.name} 게시판 보러 가기
          </Link>
        ))}
        <Link
          href="/write"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13.5px] font-bold"
          style={{
            background: "var(--wc-card)",
            color: "var(--wc-ink)",
            border: "1px solid var(--wc-line)",
          }}
        >
          <PenLine className="h-3.5 w-3.5" />
          내가 첫 글 쓰기
        </Link>
      </div>
    </div>
  )
}
