"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Loader2, ArrowLeft, User, Check, Save } from "lucide-react"
import { AvatarSection } from "./settings/avatar-section"
import { PasswordSection } from "./settings/password-section"
import { FollowedCommunitiesSection } from "./settings/followed-communities-section"
import { DeleteAccountSection } from "./settings/delete-account-section"

interface Profile {
  user_id: string
  nickname: string
  nickname_changed_at: string | null
  avatar_url: string
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

  const [profile, setProfile] = useState<Profile | null>(null)
  const [nickname, setNickname] = useState("")
  const [followedCommunities, setFollowedCommunities] = useState<FollowedCommunity[]>([])

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/profile/me")
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
        setNickname(data.nickname || user?.username || "")
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
        body: JSON.stringify({ nickname: trimmedNickname }),
      })

      if (response.ok) {
        const updatedProfile = await response.json()
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
