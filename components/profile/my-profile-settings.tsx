"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Loader2,
  ArrowLeft,
  User,
  Check,
  Save,
  Coins,
  Trophy,
  ImageIcon,
  MessageSquare,
  ThumbsUp,
  Calendar,
  Settings,
  Star,
  FileText,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { AvatarSection } from "./settings/avatar-section"
import { PasswordSection } from "./settings/password-section"
import { FollowedCommunitiesSection } from "./settings/followed-communities-section"
import { DeleteAccountSection } from "./settings/delete-account-section"
import { TitleBadge } from "@/components/profile/title-badge"
import { UserProfileBadge } from "@/components/profile/user-profile-badge"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface Profile {
  user_id: string
  nickname: string
  nickname_changed_at: string | null
  avatar_url: string
  bio: string | null
  favorite_team: string | null
  favorite_player: string | null
  is_journalist?: boolean
  is_expert?: boolean
  created_at?: string
}

interface FollowedCommunity {
  community_slug: string
  created_at: string
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

interface PublicPost {
  id: string
  title: string
  vote_count: number
  comment_count: number
  created_at: string
  community_slug: string
}

export function MyProfileSettings() {
  const router = useRouter()
  const { signOut } = useAuth()
  const { user } = useUser()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { toast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nickname, setNickname] = useState("")
  const [bio, setBio] = useState("")
  const [favoriteTeam, setFavoriteTeam] = useState("")
  const [favoritePlayer, setFavoritePlayer] = useState("")
  const [followedCommunities, setFollowedCommunities] = useState<FollowedCommunity[]>([])

  // Dashboard data from public profile API
  const { data: dashboardData } = useSWR(user?.id ? `/api/profile/${user.id}` : null, fetcher, {
    revalidateOnFocus: false,
  })

  const boardPoints: BoardPointInfo[] = dashboardData?.board_points ?? []
  const equippedTitles: EquippedTitleInfo[] = dashboardData?.equipped_titles ?? []
  const pixelArts: PixelArtInfo[] = dashboardData?.pixel_arts ?? []
  const recentPosts: PublicPost[] = dashboardData?.recent_posts ?? []

  const totalPoints = boardPoints.reduce((sum, bp) => sum + bp.total_points, 0)

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/profile/me")
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
        setNickname(data.nickname || user?.username || "")
        setBio(data.bio || "")
        setFavoriteTeam(data.favorite_team || "")
        setFavoritePlayer(data.favorite_player || "")
      }
    } catch (err) {
      console.error("Failed to load profile:", err)
    } finally {
      setIsLoading(false)
    }
  }, [user?.username])

  const loadFollowedCommunities = useCallback(async () => {
    try {
      const response = await fetch("/api/community/follows")
      if (response.ok) {
        const data = await response.json()
        setFollowedCommunities(data.communities || [])
      }
    } catch (err) {
      console.error("Failed to load followed communities:", err)
    }
  }, [])

  useEffect(() => {
    loadProfile()
    loadFollowedCommunities()
  }, [loadProfile, loadFollowedCommunities])

  const handleSaveProfile = async () => {
    const trimmedNickname = nickname.trim()

    if (!trimmedNickname) {
      toast({ variant: "destructive", title: "알림", description: "닉네임을 입력해주세요." })
      return
    }
    if (trimmedNickname.length < 2) {
      toast({
        variant: "destructive",
        title: "알림",
        description: "닉네임은 2자 이상이어야 합니다.",
      })
      return
    }
    if (trimmedNickname.length > 20) {
      toast({
        variant: "destructive",
        title: "알림",
        description: "닉네임은 20자 이하여야 합니다.",
      })
      return
    }

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: trimmedNickname,
          bio: bio.trim() || null,
          favorite_team: favoriteTeam.trim() || null,
          favorite_player: favoritePlayer.trim() || null,
        }),
      })

      if (response.ok) {
        const updatedProfile = await response.json()

        // 첫 1회 보상: 이전에 없던 필드를 새로 설정한 경우
        const rewards: Promise<unknown>[] = []
        if (
          (favoriteTeam.trim() || favoritePlayer.trim()) &&
          !profile?.favorite_team &&
          !profile?.favorite_player
        ) {
          rewards.push(
            fetch("/api/gold/reward", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: 200,
                description: "최애 팀/선수 첫 설정 보상",
                transaction_type: "onboarding_reward",
              }),
            })
          )
        }
        if (rewards.length > 0) {
          await Promise.allSettled(rewards)
          toast({ title: "보상 지급!", description: "첫 설정 보상 골드가 지급되었습니다." })
          window.dispatchEvent(new Event("goldBalanceUpdate"))
        }

        setProfile(updatedProfile)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        const errorData = await response.json().catch(() => ({ error: "저장에 실패했습니다." }))
        const errorMessage = errorData.details
          ? `${errorData.error}\n\n상세: ${errorData.details}`
          : errorData.error || "저장에 실패했습니다."
        toast({ variant: "destructive", title: "오류", description: errorMessage })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnfollowCommunity = async (communitySlug: string) => {
    try {
      const response = await fetch(`/api/community/${communitySlug}/follow`, { method: "DELETE" })
      if (response.ok) {
        setFollowedCommunities((prev) => prev.filter((c) => c.community_slug !== communitySlug))
      }
    } catch (err) {
      console.error("Failed to unfollow community:", err)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch("/api/profile/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "계정삭제" }),
      })
      if (response.ok) {
        await signOut()
        router.push("/")
      } else {
        toast({ variant: "destructive", title: "오류", description: "계정 삭제에 실패했습니다." })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "오류",
        description: "계정 삭제 중 오류가 발생했습니다.",
      })
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-[1200px] px-4 py-6" tabIndex={-1}>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <User className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold">마이페이지</h1>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">정보를 불러오는 중...</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ── 왼쪽 컬럼: 프로필 + 활동 포인트 ── */}
          <div className="space-y-4 lg:col-span-4">
            {/* 프로필 카드 */}
            <Card className="gap-0 overflow-hidden py-0">
              <div className="from-primary/5 to-primary/10 bg-gradient-to-br p-6">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="ring-background mb-3 h-20 w-20 ring-2">
                    <AvatarImage
                      src={profile?.avatar_url || user?.imageUrl || "/placeholder-user.jpg"}
                      alt={profile?.nickname || "프로필"}
                    />
                    <AvatarFallback className="text-xl font-semibold">
                      {(profile?.nickname || user?.username || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{profile?.nickname || "사용자"}</h2>
                    {profile?.is_expert && <UserProfileBadge isExpert size="sm" />}
                    {profile?.is_journalist && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        기자
                      </span>
                    )}
                  </div>
                  {profile?.bio && (
                    <p className="text-muted-foreground mt-1 text-sm">{profile.bio}</p>
                  )}
                </div>
              </div>
              <div className="border-border border-t">
                <div className="flex flex-col items-center py-3">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {totalPoints.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-[10px]">총 포인트</span>
                </div>
              </div>
              {profile?.created_at && (
                <div className="text-muted-foreground border-border flex items-center justify-center gap-1.5 border-t px-4 py-2 text-xs">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(profile.created_at).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                    })}
                    {" 가입"}
                  </span>
                </div>
              )}
            </Card>

            {/* 활동 포인트 & 레벨 카드 */}
            {boardPoints.length > 0 && (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="border-border flex items-center gap-2 border-b px-4 py-3">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">활동 포인트 & 칭호</h3>
                </div>
                <div className="divide-border divide-y">
                  {boardPoints.map((bp) => {
                    const equipped = equippedTitles.find((t) => t.board_slug === bp.board_slug)
                    return (
                      <div key={bp.board_slug} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {COMMUNITY_NAMES[bp.board_slug] || bp.board_slug}
                          </span>
                          <span className="text-xs font-medium text-amber-600 tabular-nums dark:text-amber-400">
                            {bp.total_points.toLocaleString()}P
                          </span>
                        </div>
                        {equipped && (equipped.adj_title || equipped.noun_title) && (
                          <div className="mt-1.5">
                            <TitleBadge
                              adjTitle={equipped.adj_title}
                              nounTitle={equipped.noun_title}
                              rarity={
                                equipped.rarity as "common" | "rare" | "epic" | "legendary" | null
                              }
                              size="sm"
                            />
                          </div>
                        )}
                        {/* 포인트 바 */}
                        <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
                            style={{
                              width: `${Math.min(100, (bp.total_points % 1000) / 10)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* 픽셀아트 컬렉션 카드 */}
            {pixelArts.length > 0 && (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="border-border flex items-center gap-2 border-b px-4 py-3">
                  <ImageIcon className="text-primary h-4 w-4" />
                  <h3 className="text-sm font-semibold">픽셀아트 컬렉션</h3>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {pixelArts.length}개
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 p-3">
                  {pixelArts.map((pa) => (
                    <div key={pa.pixel_art_id} className="flex flex-col items-center gap-1">
                      <div className="bg-muted flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg">
                        <Image
                          src={pa.pixel_art_items.image_url}
                          alt={pa.pixel_art_items.name}
                          width={40}
                          height={40}
                          className="object-contain"
                          style={{ imageRendering: "pixelated" }}
                          unoptimized
                        />
                      </div>
                      <span className="text-muted-foreground max-w-full truncate text-[9px]">
                        {pa.pixel_art_items.name}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── 가운데 컬럼: 최근 작성글 ── */}
          <div className="space-y-4 lg:col-span-4">
            <Card className="gap-0 overflow-hidden py-0">
              <div className="border-border flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText className="text-primary h-4 w-4" />
                  <h3 className="text-sm font-semibold">최근 작성글</h3>
                </div>
                <Link href="/my-posts" className="text-primary text-xs hover:underline">
                  전체보기
                </Link>
              </div>
              {recentPosts.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <FileText className="text-muted-foreground/40 mb-2 h-10 w-10" />
                  <p className="text-muted-foreground text-sm">작성한 글이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-border divide-y">
                  {recentPosts.slice(0, 8).map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="hover:bg-muted/50 block px-4 py-3 transition-colors"
                    >
                      <p className="text-foreground truncate text-sm font-medium">{post.title}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-muted-foreground flex items-center gap-2 text-xs">
                          <span className="bg-muted rounded px-1.5 py-0.5 text-[10px]">
                            {COMMUNITY_NAMES[post.community_slug] || post.community_slug}
                          </span>
                          <span>{formatRelativeTime(new Date(post.created_at))}</span>
                        </div>
                        <div className="text-muted-foreground flex items-center gap-2 text-xs">
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

          {/* ── 오른쪽 컬럼: 계정 설정 ── */}
          <div className="space-y-4 lg:col-span-4">
            <Card className="gap-0 overflow-hidden py-0">
              <div className="border-border flex items-center gap-2 border-b px-4 py-3">
                <Settings className="text-primary h-4 w-4" />
                <h3 className="text-sm font-semibold">계정 설정</h3>
              </div>

              <div className="space-y-5 p-4">
                {/* 아바타 */}
                <AvatarSection
                  avatarUrl={profile?.avatar_url || user?.imageUrl || "/placeholder-user.jpg"}
                  nickname={profile?.nickname || "프로필"}
                  fallbackChar={(profile?.nickname || user?.username || "U")[0]}
                  onAvatarChanged={(url) =>
                    setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev))
                  }
                />

                <Separator />

                {/* 닉네임 */}
                <div className="space-y-2">
                  <Label
                    htmlFor="nickname"
                    className="flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <User className="h-3.5 w-3.5" />
                    닉네임
                  </Label>
                  {(() => {
                    const cooldownMs = 90 * 24 * 60 * 60 * 1000
                    const changedAt = profile?.nickname_changed_at
                      ? new Date(profile.nickname_changed_at).getTime()
                      : 0
                    const nextChangeAt = changedAt + cooldownMs
                    const isOnCooldown = changedAt > 0 && Date.now() < nextChangeAt
                    return (
                      <>
                        <Input
                          id="nickname"
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                          placeholder="닉네임을 입력하세요"
                          maxLength={20}
                          disabled={isOnCooldown}
                          className={isOnCooldown ? "bg-muted" : ""}
                        />
                        {isOnCooldown ? (
                          <p className="text-xs text-amber-600">
                            {new Date(nextChangeAt).toLocaleDateString("ko-KR")} 이후 변경 가능
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-[10px]">
                            2~20자. 변경 후 3개월간 재변경 불가
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* 이메일 */}
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">이메일</Label>
                  <Input
                    value={user?.primaryEmailAddress?.emailAddress || ""}
                    disabled
                    className="bg-muted text-xs"
                  />
                </div>

                <Separator />

                {/* 한줄 소개 */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">한줄 소개</Label>
                  <Input
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="자신을 한 줄로 소개해보세요"
                    maxLength={50}
                  />
                  <p className="text-muted-foreground text-right text-[10px]">{bio.length}/50</p>
                </div>

                <Separator />

                {/* 최애 팀 & 선수 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold">
                      <Star className="h-3.5 w-3.5" />
                      최애 팀 & 선수
                    </Label>
                    {!profile?.favorite_team && !profile?.favorite_player && (
                      <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                        <Coins className="h-2.5 w-2.5" />
                        +200G
                      </span>
                    )}
                  </div>
                  <Input
                    value={favoriteTeam}
                    onChange={(e) => setFavoriteTeam(e.target.value)}
                    placeholder="최애 팀 (예: 리버풀, T1)"
                    maxLength={30}
                  />
                  <Input
                    value={favoritePlayer}
                    onChange={(e) => setFavoritePlayer(e.target.value)}
                    placeholder="최애 선수 (예: 손흥민, 페이커)"
                    maxLength={30}
                  />
                </div>

                <Separator />

                <FollowedCommunitiesSection
                  communities={followedCommunities}
                  onUnfollow={handleUnfollowCommunity}
                />

                <PasswordSection user={user} />

                {/* 저장 버튼 */}
                <Button className="w-full" onClick={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isSaving ? "저장 중..." : saveSuccess ? "저장됨" : "변경사항 저장"}
                </Button>

                <Separator />

                <DeleteAccountSection onDelete={handleDeleteAccount} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </main>
  )
}
