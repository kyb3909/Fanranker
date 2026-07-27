"use client"

import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, User, MessageSquare, ThumbsUp, Trophy, ImageIcon } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { UserProfileHeader } from "@/components/profile/user-profile-header"
import { TitleBadge } from "@/components/profile/title-badge"
import { formatRelativeTime } from "@/lib/utils/date"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface PublicProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
  bio: string | null
  is_journalist: boolean
  is_expert: boolean
  created_at: string
  display_title?: { id: string; name: string; flair_name: string } | null
}

interface FlairTopEntry {
  flair_id: string
  flair_name: string
  flair_color: string | null
  community_slug: string
  score_total: number
}

interface PublicPost {
  id: string
  title: string
  vote_count: number
  comment_count: number
  created_at: string
  community_slug: string
}

interface BoardPointInfo {
  board_slug: string
  total_points: number
  available_points: number
}

interface EquippedTitleInfo {
  board_slug: string
  adj_title: string | null
  noun_title: string | null
  rarity: string | null
}

interface PixelArtInfo {
  pixel_art_id: string
  purchased_at: string
  pixel_art_items: {
    id: string
    slug: string
    name: string
    image_url: string
    category: string
  }
}

interface TeamKarmaInfo {
  team_id: string
  team_name: string
  team_short_name: string
  sport: string
  color: string | null
  points: number
}

const PROFILE_TABS = [
  { id: "posts", label: "게시물" },
  { id: "predictions", label: "예측" },
] as const
type ProfileTab = (typeof PROFILE_TABS)[number]["id"]

export function PublicProfileView({ userId }: { userId: string }) {
  const router = useRouter()
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts")

  const { data, isLoading, error } = useSWR(`/api/profile/${userId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const publicProfile: PublicProfile | null = data?.profile ?? null
  const publicPosts: PublicPost[] = data?.recent_posts ?? []
  const boardPoints: BoardPointInfo[] = data?.board_points ?? []
  const equippedTitles: EquippedTitleInfo[] = data?.equipped_titles ?? []
  const pixelArts: PixelArtInfo[] = data?.pixel_arts ?? []
  const teamKarma: TeamKarmaInfo[] = data?.team_karma ?? []
  const totalKarma: number = data?.total_karma ?? 0
  const flairTop: FlairTopEntry[] = data?.flair_top ?? []
  const profileNotFound = !!error || (data && !data.profile)

  if (profileNotFound) {
    return (
      <main
        id="main-content"
        className="worldcup-scope mx-auto max-w-[600px] px-4 py-6"
        tabIndex={-1}
      >
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <User className="mx-auto mb-3 h-12 w-12 opacity-30" style={{ color: "var(--wc-mute)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--wc-ink)" }}>
            사용자를 찾을 수 없습니다
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--wc-mute)" }}>
            탈퇴했거나 존재하지 않는 사용자입니다.
          </p>
        </div>
      </main>
    )
  }

  if (isLoading || !publicProfile) {
    return (
      <div className="worldcup-scope flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--wc-mute)" }} />
      </div>
    )
  }

  return (
    <main
      id="main-content"
      className="worldcup-scope mx-auto max-w-[600px] px-4 py-6"
      tabIndex={-1}
    >
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold" style={{ color: "var(--wc-ink)" }}>
          프로필
        </h1>
      </div>

      <div className="space-y-4">
        {/* 프로필 헤더 카드 */}
        <div
          className="overflow-hidden rounded-xl"
          style={{
            background: "var(--wc-card)",
            boxShadow: "var(--wc-shadow-1)",
            padding: "24px 24px 0",
          }}
        >
          <UserProfileHeader
            userId={publicProfile.user_id}
            nickname={publicProfile.nickname}
            avatarUrl={publicProfile.avatar_url}
            isExpert={publicProfile.is_expert}
            isJournalist={publicProfile.is_journalist}
            currentUserId={user?.id || null}
          />

          {/* 가입일 + 호칭 */}
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]"
            style={{ color: "var(--wc-mute)" }}
          >
            {publicProfile.bio && <span>{publicProfile.bio} ·</span>}
            <span>
              {new Date(publicProfile.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
              })}{" "}
              가입
            </span>
            {publicProfile.display_title && (
              <>
                <span aria-hidden>·</span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-px text-[11px] font-bold"
                  style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
                >
                  🏆 {publicProfile.display_title.flair_name} {publicProfile.display_title.name}
                </span>
              </>
            )}
          </div>

          {/* 스탯 행 */}
          <div className="mt-4 flex gap-6 pb-0.5">
            <span
              className="tnum text-[13px]"
              style={{ color: "var(--wc-mute)", paddingBottom: 12 }}
            >
              <b style={{ color: "var(--wc-ink)", fontSize: 15 }}>{publicPosts.length}</b> 게시물
            </span>
          </div>

          {/* underline-tabs */}
          <div className="wc-underline-tabs" style={{ margin: "0 -24px" }}>
            {PROFILE_TABS.map((t) => (
              <button
                key={t.id}
                className={activeTab === t.id ? "on" : ""}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 게시물 탭 콘텐츠 ──────────────────────────────── */}
        {activeTab === "posts" && (
          <>
            {/* 팬 활동 점수 */}
            {flairTop.length > 0 && (
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--wc-line)" }}
                >
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                    팬 활동 점수
                  </h3>
                </div>
                <div className="space-y-2 px-4 py-3">
                  {flairTop.map((f) => (
                    <div
                      key={f.flair_id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                      style={{
                        background: "var(--wc-paper)",
                        // 한쪽 면 액센트 보더 금지 — 팀 색은 배경 틴트로만
                        ...(f.flair_color
                          ? { background: `color-mix(in srgb, ${f.flair_color} 8%, transparent)` }
                          : {}),
                      }}
                    >
                      <span className="font-medium" style={{ color: "var(--wc-ink)" }}>
                        {f.flair_name}
                      </span>
                      <span className="tnum" style={{ color: "var(--wc-mute)" }}>
                        {f.score_total.toLocaleString()}p
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 게시판별 칭호 & 레벨 */}
            {boardPoints.length > 0 && (
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--wc-line)" }}
                >
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                    활동 & 칭호
                  </h3>
                </div>
                <div style={{ borderTop: "1px solid var(--wc-line)" }}>
                  {boardPoints.map((bp) => {
                    const equipped = equippedTitles.find((t) => t.board_slug === bp.board_slug)
                    return (
                      <div
                        key={bp.board_slug}
                        className="flex items-center justify-between px-4 py-3"
                        style={{ borderBottom: "1px solid var(--wc-line)" }}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium" style={{ color: "var(--wc-ink)" }}>
                            {COMMUNITY_NAMES[bp.board_slug] || bp.board_slug}
                          </span>
                          {equipped && (equipped.adj_title || equipped.noun_title) && (
                            <TitleBadge
                              adjTitle={equipped.adj_title}
                              nounTitle={equipped.noun_title}
                              rarity={
                                equipped.rarity as "common" | "rare" | "epic" | "legendary" | null
                              }
                              size="sm"
                            />
                          )}
                        </div>
                        <span
                          className="tnum text-xs font-bold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          {bp.total_points.toLocaleString()}P
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 팀 카르마 */}
            {teamKarma.length > 0 && (
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid var(--wc-line)" }}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-base">
                      🏟️
                    </span>
                    <h3 className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                      팀 카르마
                    </h3>
                  </div>
                  <div className="tnum text-[11px]" style={{ color: "var(--wc-mute)" }}>
                    총 <b style={{ color: "var(--wc-burgundy)" }}>{totalKarma.toLocaleString()}</b>
                    점
                  </div>
                </div>
                <div>
                  {teamKarma.slice(0, 8).map((tk) => {
                    const pct = totalKarma > 0 ? (tk.points / totalKarma) * 100 : 0
                    const color = tk.color || "#888"
                    return (
                      <div
                        key={tk.team_id}
                        className="relative flex items-center justify-between px-4 py-2.5"
                        style={{ borderBottom: "1px solid var(--wc-line)" }}
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-0"
                          style={{
                            width: `${Math.min(100, Math.max(2, pct))}%`,
                            background: `${color}18`,
                          }}
                        />
                        <div className="relative flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: color }}
                            aria-hidden
                          />
                          <span className="text-sm font-medium" style={{ color: "var(--wc-ink)" }}>
                            {tk.team_short_name || tk.team_name}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--wc-mute)" }}>
                            {tk.sport}
                          </span>
                        </div>
                        <span
                          className="tnum relative text-xs font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {tk.points.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                  {teamKarma.length > 8 && (
                    <div
                      className="px-4 py-2 text-center text-[11px]"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      외 {teamKarma.length - 8}개 팀
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 픽셀아트 컬렉션 */}
            {pixelArts.length > 0 && (
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--wc-line)" }}
                >
                  <ImageIcon className="h-4 w-4" style={{ color: "var(--wc-burgundy)" }} />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                    픽셀아트 컬렉션
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-5">
                  {pixelArts.map((pa) => (
                    <div key={pa.pixel_art_id} className="flex flex-col items-center gap-1">
                      <div
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg"
                        style={{ background: "var(--wc-paper)" }}
                      >
                        <Image
                          src={pa.pixel_art_items.image_url}
                          alt={pa.pixel_art_items.name}
                          width={48}
                          height={48}
                          className="object-contain"
                          style={{ imageRendering: "pixelated" }}
                          unoptimized
                        />
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--wc-mute)" }}>
                        {pa.pixel_art_items.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 최근 작성글 */}
            <div
              className="overflow-hidden rounded-xl"
              style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--wc-line)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                  최근 작성글
                </h3>
              </div>
              {publicPosts.length === 0 ? (
                <p className="py-8 text-center text-sm" style={{ color: "var(--wc-mute)" }}>
                  작성한 글이 없습니다.
                </p>
              ) : (
                <div>
                  {publicPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="gn-card-lift block px-4 py-3 transition-colors"
                      style={{ borderBottom: "1px solid var(--wc-line)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-semibold"
                            style={{ color: "var(--wc-ink)" }}
                          >
                            {post.title}
                          </p>
                          <div
                            className="mt-1 flex items-center gap-3 text-xs"
                            style={{ color: "var(--wc-mute-2)" }}
                          >
                            <span>
                              {COMMUNITY_NAMES[post.community_slug] || post.community_slug}
                            </span>
                            <span>{formatRelativeTime(new Date(post.created_at))}</span>
                          </div>
                        </div>
                        <div
                          className="tnum flex shrink-0 items-center gap-2.5 text-xs"
                          style={{ color: "var(--wc-mute)" }}
                        >
                          <span className="flex items-center gap-0.5">
                            <ThumbsUp className="h-3 w-3" />
                            {post.vote_count || 0}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" />
                            {post.comment_count || 0}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 예측 탭 콘텐츠 ──────────────────────────────── */}
        {activeTab === "predictions" && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
          >
            <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
              승부예측 내역은 본인만 확인할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
