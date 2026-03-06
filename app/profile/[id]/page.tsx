"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
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
  MessageSquare,
  ThumbsUp,
  Calendar,
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
import { UserProfileHeader } from "@/components/user-profile-header"
import { formatRelativeTime } from "@/lib/utils/date"
import Link from "next/link"

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string
}

interface PublicProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
  bio: string | null
  temperature: number
  is_journalist: boolean
  is_expert: boolean
  created_at: string
}

interface PublicPost {
  id: string
  title: string
  vote_count: number
  comment_count: number
  created_at: string
  community_slug: string
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

  // 공개 프로필 상태
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null)
  const [publicPosts, setPublicPosts] = useState<PublicPost[]>([])
  const [profileNotFound, setProfileNotFound] = useState(false)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [nickname, setNickname] = useState("")
  const [followedCommunities, setFollowedCommunities] = useState<FollowedCommunity[]>([])

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

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

  // 공개 프로필 로드
  const loadPublicProfile = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/profile/${userId}`)
      if (response.ok) {
        const data = await response.json()
        setPublicProfile(data.profile)
        setPublicPosts(data.recent_posts || [])
      } else if (response.status === 404) {
        setProfileNotFound(true)
      }
    } catch {
      setProfileNotFound(true)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // 현재 사용자 확인 및 데이터 로드
  useEffect(() => {
    if (!isLoaded) return

    const currentUserId = user?.id
    const isSameUser = !!(currentUserId && currentUserId === userId)

    setIsCurrentUser(isSameUser)

    if (isSameUser && isSignedIn) {
      // 본인 프로필 → 설정 화면
      loadProfile()
      loadFollowedCommunities()
    } else {
      // 타인 프로필 또는 비로그인 → 공개 프로필
      loadPublicProfile()
    }
  }, [isLoaded, isSignedIn, user, userId, loadProfile, loadFollowedCommunities, loadPublicProfile])

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
        setFollowedCommunities((prev) => prev.filter((c) => c.community_slug !== communitySlug))
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  // 타인 프로필 또는 비로그인 → 공개 프로필 뷰
  if (!isCurrentUser) {
    if (!isLoaded) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )
    }

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

        {/* 프로필 헤더 */}
        <Card className="mb-4 overflow-hidden">
          <UserProfileHeader
            userId={publicProfile.user_id}
            nickname={publicProfile.nickname}
            avatarUrl={publicProfile.avatar_url}
            isExpert={publicProfile.is_expert}
            isJournalist={publicProfile.is_journalist}
            temperature={publicProfile.temperature}
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
          </div>
        </Card>

        {/* 최근 작성글 */}
        <Card className="overflow-hidden">
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
      </main>
    )
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
          {/* 프로필 사진 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Camera className="text-primary h-5 w-5" />
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
                <p className="text-muted-foreground mb-2 text-sm">
                  이미지 파일(JPG, PNG 등)을 선택하면 프로필 사진이 변경됩니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="mr-2 h-4 w-4" />
                  )}
                  {avatarUploading ? "업로드 중..." : "사진 변경"}
                </Button>
              </div>
            </div>
          </Card>

          {/* 닉네임 변경 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <User className="text-primary h-5 w-5" />
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
                <p className="text-muted-foreground text-xs">2~20자 이내로 입력해주세요.</p>
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

          {/* 팔로우한 게시판 */}
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Hash className="text-primary h-5 w-5" />
              <h2 className="font-semibold">팔로우한 게시판</h2>
            </div>

            {followedCommunities.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                팔로우한 게시판이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {followedCommunities.map((community) => (
                  <div
                    key={community.community_slug}
                    className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
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
            <div className="mb-4 flex items-center gap-2">
              <Lock className="text-primary h-5 w-5" />
              <h2 className="font-semibold">비밀번호</h2>
            </div>

            <p className="text-muted-foreground mb-4 text-sm">
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
              <Button variant="outline" onClick={handleChangePassword} disabled={passwordSaving}>
                {passwordSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                {passwordSaving ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              소셜 로그인(Google 등)만 사용 중인 경우 비밀번호가 없을 수 있습니다.
            </p>
          </Card>

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

          {/* 계정 삭제 */}
          <Card className="border-destructive/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Trash2 className="text-destructive h-5 w-5" />
              <h2 className="text-destructive font-semibold">계정 삭제</h2>
            </div>

            <p className="text-muted-foreground mb-4 text-sm">
              계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
            </p>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="mr-2 h-4 w-4" />
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
                  <Label htmlFor="delete-confirm" className="text-muted-foreground text-sm">
                    확인을 위해 <span className="text-destructive font-semibold">계정삭제</span>를
                    입력해주세요
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
                  <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
                    취소
                  </AlertDialogCancel>
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
  )
}
