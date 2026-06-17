"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, ArrowLeft, User, Sparkles, Hash, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

import { ProfileHero } from "./profile-hero"
import { ActivityTab } from "./tabs/activity-tab"
import { AvatarSection } from "./settings/avatar-section"
import { PasswordSection } from "./settings/password-section"
import { FollowedCommunitiesSection } from "./settings/followed-communities-section"
import { DeleteAccountSection } from "./settings/delete-account-section"
import { FanIdentitySection } from "./settings/fan-identity-section"
import { ProfileBasicForm } from "./settings/profile-basic-form"

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

interface FlairTopEntry {
  flair_id: string
  flair_name: string
  flair_color: string | null
  community_slug: string
  score_total: number
}

interface DisplayTitle {
  id: string
  name: string
  flair_name: string
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

  const { data: dashboardData } = useSWR(user?.id ? `/api/profile/${user.id}` : null, fetcher, {
    revalidateOnFocus: false,
  })

  const pixelArts: PixelArtInfo[] = dashboardData?.pixel_arts ?? []
  const recentPosts: PublicPost[] = dashboardData?.recent_posts ?? []
  const flairTop: FlairTopEntry[] = dashboardData?.flair_top ?? []
  const displayTitle: DisplayTitle | null = dashboardData?.profile?.display_title ?? null

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

        // 골드 경제 잠시 비활성 (launch) — 첫 설정 골드 지급 보류. 골드 오픈 시 아래 블록 복원.
        /*
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
        */

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

  const avatarUrl = profile?.avatar_url || user?.imageUrl || "/placeholder-user.jpg"
  const fallbackChar = (profile?.nickname || user?.username || "U")[0].toUpperCase()
  const hasFavoriteSet = !!(profile?.favorite_team || profile?.favorite_player)

  return (
    <main id="main-content" className="mx-auto max-w-[820px] px-4 py-6" tabIndex={-1}>
      {/* 헤더 */}
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">마이페이지</h1>
      </div>

      {isLoading ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
        >
          <Loader2
            className="mx-auto mb-2 h-8 w-8 animate-spin"
            style={{ color: "var(--wc-mute)" }}
          />
          <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
            정보를 불러오는 중...
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <ProfileHero
            avatarUrl={avatarUrl}
            nickname={profile?.nickname || "사용자"}
            fallbackChar={fallbackChar}
            bio={profile?.bio}
            isExpert={!!profile?.is_expert}
            isJournalist={!!profile?.is_journalist}
            createdAt={profile?.created_at}
            displayTitle={displayTitle}
            postCount={recentPosts.length}
            pixelArtCount={pixelArts.length}
            flairCount={flairTop.length}
          />

          <Tabs defaultValue="activity" className="gap-4">
            <TabsList
              className="h-auto w-full justify-start gap-0 rounded-none p-0"
              style={{
                background: "transparent",
                borderBottom: "1px solid var(--wc-line)",
              }}
            >
              <TabsTrigger
                value="activity"
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold shadow-none data-[state=active]:border-[var(--wc-burgundy)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--wc-burgundy)] data-[state=active]:shadow-none"
                style={{ color: "var(--wc-mute)" }}
              >
                <User className="h-3.5 w-3.5" />
                활동
              </TabsTrigger>
              <TabsTrigger
                value="identity"
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold shadow-none data-[state=active]:border-[var(--wc-burgundy)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--wc-burgundy)] data-[state=active]:shadow-none"
                style={{ color: "var(--wc-mute)" }}
              >
                <Sparkles className="h-3.5 w-3.5" />팬 정체성
              </TabsTrigger>
              <TabsTrigger
                value="follows"
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold shadow-none data-[state=active]:border-[var(--wc-burgundy)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--wc-burgundy)] data-[state=active]:shadow-none"
                style={{ color: "var(--wc-mute)" }}
              >
                <Hash className="h-3.5 w-3.5" />
                팔로우
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold shadow-none data-[state=active]:border-[var(--wc-burgundy)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--wc-burgundy)] data-[state=active]:shadow-none"
                style={{ color: "var(--wc-mute)" }}
              >
                <Settings className="h-3.5 w-3.5" />
                설정
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              <ActivityTab recentPosts={recentPosts} pixelArts={pixelArts} />
            </TabsContent>

            <TabsContent value="identity">
              <FanIdentitySection />
            </TabsContent>

            <TabsContent value="follows">
              <FollowedCommunitiesSection
                communities={followedCommunities}
                onUnfollow={handleUnfollowCommunity}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <AvatarSection
                avatarUrl={avatarUrl}
                nickname={profile?.nickname || "프로필"}
                fallbackChar={fallbackChar}
                onAvatarChanged={(url) =>
                  setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev))
                }
              />

              <ProfileBasicForm
                email={user?.primaryEmailAddress?.emailAddress || ""}
                nickname={nickname}
                setNickname={setNickname}
                nicknameChangedAt={profile?.nickname_changed_at ?? null}
                bio={bio}
                setBio={setBio}
                favoriteTeam={favoriteTeam}
                setFavoriteTeam={setFavoriteTeam}
                favoritePlayer={favoritePlayer}
                setFavoritePlayer={setFavoritePlayer}
                hasFavoriteSet={hasFavoriteSet}
                isSaving={isSaving}
                saveSuccess={saveSuccess}
                onSave={handleSaveProfile}
              />

              <PasswordSection user={user} />

              <DeleteAccountSection onDelete={handleDeleteAccount} />

              {/* 로그아웃 */}
              <button
                onClick={() => signOut()}
                className="w-full text-left"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderTop: "1px solid var(--wc-line)",
                  background: "var(--wc-card)",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--wc-down)",
                }}
              >
                로그아웃
              </button>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </main>
  )
}
