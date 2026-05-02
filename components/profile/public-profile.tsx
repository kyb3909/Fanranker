"use client"

import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  ArrowLeft,
  User,
  MessageSquare,
  ThumbsUp,
  Calendar,
  Trophy,
  ImageIcon,
} from "lucide-react"
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

export function PublicProfileView({ userId }: { userId: string }) {
  const router = useRouter()
  const { user } = useUser()

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
      <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <Card className="p-8 text-center">
          <User className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
          <h2 className="text-lg font-semibold">사용자를 찾을 수 없습니다</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            탈퇴했거나 존재하지 않는 사용자입니다.
          </p>
        </Card>
      </main>
    )
  }

  if (isLoading || !publicProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">프로필</h1>
      </div>

      <div className="space-y-5">
        {/* 프로필 헤더 */}
        <Card className="gap-0 overflow-hidden py-0">
          <UserProfileHeader
            userId={publicProfile.user_id}
            nickname={publicProfile.nickname}
            avatarUrl={publicProfile.avatar_url}
            isExpert={publicProfile.is_expert}
            isJournalist={publicProfile.is_journalist}
            currentUserId={user?.id || null}
          />
          {publicProfile.bio && (
            <p className="text-muted-foreground px-4 pb-4 text-sm sm:px-6">{publicProfile.bio}</p>
          )}
          <div className="text-muted-foreground flex items-center gap-1.5 px-4 pb-4 text-xs sm:px-6">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {new Date(publicProfile.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
              })}
              {" 가입"}
            </span>
            {publicProfile.display_title && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-px text-[11px] font-semibold text-amber-600">
                  {publicProfile.display_title.flair_name} {publicProfile.display_title.name}
                </span>
              </>
            )}
          </div>
        </Card>

        {/* 팬 정체성 (flair top + 표시 호칭) */}
        {flairTop.length > 0 && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-border border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">팬 활동 점수</h3>
              </div>
            </div>
            <div className="space-y-2 px-4 py-3">
              {flairTop.map((f) => (
                <div
                  key={f.flair_id}
                  className="bg-muted/40 flex items-center justify-between rounded-md px-3 py-2 text-xs"
                  style={f.flair_color ? { borderLeft: `3px solid ${f.flair_color}` } : undefined}
                >
                  <span className="font-medium">{f.flair_name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {f.score_total.toLocaleString()}p
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 게시판별 칭호 & 레벨 */}
        {boardPoints.length > 0 && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-border border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">활동 & 칭호</h3>
              </div>
            </div>
            <div className="divide-border divide-y">
              {boardPoints.map((bp) => {
                const equipped = equippedTitles.find((t) => t.board_slug === bp.board_slug)
                return (
                  <div key={bp.board_slug} className="flex items-center justify-between px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
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
                    <span className="text-xs font-medium text-amber-600 tabular-nums dark:text-amber-400">
                      {bp.total_points.toLocaleString()}P
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* 팀 카르마 breakdown — 메타버스 팬 활동으로 누적된 팀별 점수 */}
        {teamKarma.length > 0 && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base">
                  🏟️
                </span>
                <h3 className="text-sm font-semibold">팀 카르마</h3>
              </div>
              <div className="text-muted-foreground text-[11px]">
                총{" "}
                <span className="text-primary font-bold tabular-nums">
                  {totalKarma.toLocaleString()}
                </span>
                <span className="ml-0.5">점</span>
              </div>
            </div>
            <div className="divide-border divide-y">
              {teamKarma.slice(0, 8).map((tk) => {
                const pct = totalKarma > 0 ? (tk.points / totalKarma) * 100 : 0
                const color = tk.color || "#888"
                return (
                  <div
                    key={tk.team_id}
                    className="relative flex items-center justify-between px-4 py-2.5"
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
                      <span className="text-sm font-medium">
                        {tk.team_short_name || tk.team_name}
                      </span>
                      <span className="text-muted-foreground text-[10px]">{tk.sport}</span>
                    </div>
                    <span className="relative text-xs font-semibold tabular-nums">
                      {tk.points.toLocaleString()}
                    </span>
                  </div>
                )
              })}
              {teamKarma.length > 8 && (
                <div className="text-muted-foreground px-4 py-2 text-center text-[11px]">
                  외 {teamKarma.length - 8}개 팀
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 보유 픽셀아트 */}
        {pixelArts.length > 0 && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-border border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="text-primary h-4 w-4" />
                <h3 className="text-sm font-semibold">픽셀아트 컬렉션</h3>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-5">
              {pixelArts.map((pa) => (
                <div key={pa.pixel_art_id} className="flex flex-col items-center gap-1">
                  <div className="bg-muted flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg">
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
                  <span className="text-muted-foreground text-[10px]">
                    {pa.pixel_art_items.name}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 최근 작성글 */}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-border border-b px-4 py-3">
            <h3 className="text-sm font-semibold">최근 작성글</h3>
          </div>
          {publicPosts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">작성한 글이 없습니다.</p>
          ) : (
            <div className="divide-border divide-y">
              {publicPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="hover:bg-muted/50 block px-4 py-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm font-medium">{post.title}</p>
                      <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                        <span>{COMMUNITY_NAMES[post.community_slug] || post.community_slug}</span>
                        <span>{formatRelativeTime(new Date(post.created_at))}</span>
                      </div>
                    </div>
                    <div className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-xs">
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
        </Card>
      </div>
    </main>
  )
}
