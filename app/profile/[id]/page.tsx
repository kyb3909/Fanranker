"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  ArrowLeft,
  User,
  Camera,
  Hash,
  Lock,
  Check,
  Save,
  Trash2,
  X,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string
}

interface FollowedCommunity {
  community_slug: string
  created_at: string
}

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { isSignedIn, isLoaded, signOut } = useAuth()
  const { user } = useUser()
  const userId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isCurrentUser, setIsCurrentUser] = useState(false)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [nickname, setNickname] = useState("")
  const [followedCommunities, setFollowedCommunities] = useState<FollowedCommunity[]>([])

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/profile/me")
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
        setNickname(data.nickname || user?.username || "")
      }
    } catch {
      // Silent fail - profile will show default values
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
    } catch {
      // Silent fail - followed communities will show empty
    }
  }, [])

  // 현재 사용자 확인 및 데이터 로드
  useEffect(() => {
    if (!isLoaded) return

    const currentUserId = user?.id
    const isSameUser = currentUserId === userId

    setIsCurrentUser(isSameUser)

    if (!isSameUser) {
      // 다른 사용자의 프로필 - 현재는 지원하지 않음
      router.push("/")
      return
    }

    if (!isSignedIn) {
      router.push("/")
      return
    }

    loadProfile()
    loadFollowedCommunities()
  }, [isLoaded, isSignedIn, user, userId, router, loadProfile, loadFollowedCommunities])

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
      const response = await fetch(`/api/community/${communitySlug}/follow`, {
        method: "DELETE",
      })

      if (response.ok) {
        setFollowedCommunities((prev) =>
          prev.filter((c) => c.community_slug !== communitySlug)
        )
      }
    } catch {
      // Silent fail - unfollow action
    }
  }

  const avatarInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.")
      return
    }
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload/image?type=avatar", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "업로드 실패")
      }
      const { url } = await res.json()
      const patchRes = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url }),
      })
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}))
        throw new Error(data.error || "프로필 저장 실패")
      }
      const updated = await patchRes.json()
      setProfile(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : "프로필 사진 변경에 실패했습니다.")
    } finally {
      setAvatarUploading(false)
      e.target.value = ""
    }
  }

  const handleChangePassword = async () => {
    if (!user) return
    setPasswordMessage(null)
    if (!currentPassword.trim()) {
      setPasswordMessage({ type: "error", text: "현재 비밀번호를 입력해주세요." })
      return
    }
    if (!newPassword.trim()) {
      setPasswordMessage({ type: "error", text: "새 비밀번호를 입력해주세요." })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "새 비밀번호는 8자 이상이어야 합니다." })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "새 비밀번호와 확인이 일치하지 않습니다." })
      return
    }
    setPasswordSaving(true)
    try {
      await user.updatePassword({ currentPassword, newPassword })
      setPasswordMessage({ type: "success", text: "비밀번호가 변경되었습니다." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "errors" in err
          ? (err as { errors: Array<{ message?: string }> }).errors?.[0]?.message
          : err instanceof Error
            ? err.message
            : "비밀번호 변경에 실패했습니다."
      setPasswordMessage({ type: "error", text: String(msg) })
    } finally {
      setPasswordSaving(false)
    }
  }

  const [deleteConfirmText, setDeleteConfirmText] = useState("")

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "계정삭제") return

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

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!isSignedIn || !isCurrentUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 py-6 max-w-[600px]" tabIndex={-1}>
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">내 정보</h1>
          </div>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">정보를 불러오는 중...</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* 프로필 사진 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Camera className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">프로필 사진</h2>
              </div>

              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={profile?.avatar_url || user?.imageUrl || "/placeholder-user.jpg"}
                    alt={profile?.nickname || "프로필"}
                  />
                  <AvatarFallback className="text-2xl">
                    {(profile?.nickname || user?.username || "U")[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <p className="text-sm text-muted-foreground mb-2">
                    이미지 파일(JPG, PNG 등)을 선택하면 프로필 사진이 변경됩니다.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={avatarUploading}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarUploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4 mr-2" />
                    )}
                    {avatarUploading ? "업로드 중..." : "사진 변경"}
                  </Button>
                </div>
              </div>
            </Card>

            {/* 닉네임 변경 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">닉네임</h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname">닉네임</Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="닉네임을 입력하세요"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    2~20자 이내로 입력해주세요.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>이메일</Label>
                  <Input
                    value={user?.primaryEmailAddress?.emailAddress || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    이메일은 변경할 수 없습니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* 팔로우한 게시판 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">팔로우한 게시판</h2>
              </div>

              {followedCommunities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  팔로우한 게시판이 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {followedCommunities.map((community) => (
                    <div
                      key={community.community_slug}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="font-medium">
                        {COMMUNITY_NAMES[community.community_slug] || community.community_slug}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnfollowCommunity(community.community_slug)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 비밀번호 변경 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">비밀번호</h2>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                현재 비밀번호를 입력한 뒤 새 비밀번호로 변경할 수 있습니다. (8자 이상)
              </p>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="current-password">현재 비밀번호</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="현재 비밀번호"
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">새 비밀번호</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호 (8자 이상)"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호 다시 입력"
                    autoComplete="new-password"
                  />
                </div>
                {passwordMessage && (
                  <p
                    className={`text-sm ${
                      passwordMessage.type === "success" ? "text-green-600" : "text-destructive"
                    }`}
                  >
                    {passwordMessage.text}
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                >
                  {passwordSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  {passwordSaving ? "변경 중..." : "비밀번호 변경"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                소셜 로그인(Google 등)만 사용 중인 경우 비밀번호가 없을 수 있습니다.
              </p>
            </Card>

            {/* 저장 버튼 */}
            <Button
              className="w-full"
              onClick={handleSaveProfile}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : saveSuccess ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isSaving ? "저장 중..." : saveSuccess ? "저장됨" : "변경사항 저장"}
            </Button>

            <Separator />

            {/* 계정 삭제 */}
            <Card className="p-6 border-destructive/50">
              <div className="flex items-center gap-2 mb-4">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h2 className="font-semibold text-destructive">계정 삭제</h2>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
              </p>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    계정 삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>정말 계정을 삭제하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      이 작업은 되돌릴 수 없습니다. 모든 게시글, 댓글, 예측 내역이 영구적으로
                      삭제됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-2">
                    <Label htmlFor="delete-confirm" className="text-sm text-muted-foreground">
                      확인을 위해 <span className="font-semibold text-destructive">계정삭제</span>를 입력해주세요
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="계정삭제"
                      className="mt-2"
                      autoComplete="off"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== "계정삭제"}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
