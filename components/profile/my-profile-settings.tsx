"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Loader2, ArrowLeft, User, Check, Save, Coins } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { AvatarSection } from "./settings/avatar-section"
import { PasswordSection } from "./settings/password-section"
import { FollowedCommunitiesSection } from "./settings/followed-communities-section"
import { DeleteAccountSection } from "./settings/delete-account-section"

const MBTI_TYPES = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const

interface Profile {
  user_id: string
  nickname: string
  nickname_changed_at: string | null
  avatar_url: string
  bio: string | null
  favorite_team: string | null
  favorite_player: string | null
  mbti: string | null
}

interface FollowedCommunity {
  community_slug: string
  created_at: string
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
  const [mbti, setMbti] = useState("")
  const [followedCommunities, setFollowedCommunities] = useState<FollowedCommunity[]>([])

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
        setMbti(data.mbti || "")
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
      alert("닉네임을 입력해주세요.")
      return
    }
    if (trimmedNickname.length < 2) {
      alert("닉네임은 2자 이상이어야 합니다.")
      return
    }
    if (trimmedNickname.length > 20) {
      alert("닉네임은 20자 이하여야 합니다.")
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
          mbti: mbti || null,
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
        if (mbti && !profile?.mbti) {
          rewards.push(
            fetch("/api/gold/reward", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: 100,
                description: "MBTI 첫 설정 보상",
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
        alert(errorMessage)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
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
        alert("계정 삭제에 실패했습니다.")
      }
    } catch {
      alert("계정 삭제 중 오류가 발생했습니다.")
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <User className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold">내 정보</h1>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">정보를 불러오는 중...</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <AvatarSection
            avatarUrl={profile?.avatar_url || user?.imageUrl || "/placeholder-user.jpg"}
            nickname={profile?.nickname || "프로필"}
            fallbackChar={(profile?.nickname || user?.username || "U")[0]}
            onAvatarChanged={(url) =>
              setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev))
            }
          />

          {/* 닉네임 변경 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <User className="text-primary h-5 w-5" />
              <h2 className="font-semibold">닉네임</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">닉네임</Label>
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
                          닉네임은 {new Date(nextChangeAt).toLocaleDateString("ko-KR")} 이후에
                          변경할 수 있습니다.
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          2~20자 이내로 입력해주세요. 변경 후 3개월간 재변경이 불가합니다.
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <Label>이메일</Label>
                <Input
                  value={user?.primaryEmailAddress?.emailAddress || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-muted-foreground text-xs">이메일은 변경할 수 없습니다.</p>
              </div>
            </div>
          </Card>

          {/* 한줄 소개 */}
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">한줄 소개</h2>
            <Input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="자신을 한 줄로 소개해보세요"
              maxLength={50}
            />
            <p className="text-muted-foreground mt-1 text-xs">{bio.length}/50</p>
          </Card>

          {/* 최애 팀 & 선수 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="font-semibold">최애 팀 & 선수</h2>
              {!profile?.favorite_team && !profile?.favorite_player && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  <Coins className="h-3 w-3" />첫 설정 시 +200 골드
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label>최애 팀</Label>
                <Input
                  value={favoriteTeam}
                  onChange={(e) => setFavoriteTeam(e.target.value)}
                  placeholder="예: 리버풀, LG 트윈스, T1"
                  maxLength={30}
                />
              </div>
              <div>
                <Label>최애 선수</Label>
                <Input
                  value={favoritePlayer}
                  onChange={(e) => setFavoritePlayer(e.target.value)}
                  placeholder="예: 손흥민, 오타니, 페이커"
                  maxLength={30}
                />
              </div>
            </div>
          </Card>

          {/* MBTI */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="font-semibold">MBTI</h2>
              {!profile?.mbti && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  <Coins className="h-3 w-3" />첫 설정 시 +100 골드
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MBTI_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMbti(mbti === type ? "" : type)}
                  className={`rounded-lg py-2 text-xs font-bold transition-all ${
                    mbti === type
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </Card>

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
      )}
    </main>
  )
}
