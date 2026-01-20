"use client"

import { useState, useEffect } from "react"
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
  ExternalLink,
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

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string
}

interface FollowedCommunity {
  community_slug: string
  created_at: string
}

// 커뮤니티 이름 매핑
const communityNames: Record<string, string> = {
  free: "자유게시판",
  humor: "유머게시판",
  soccer: "축구게시판",
  baseball: "야구게시판",
  basketball: "농구게시판",
  esports: "e스포츠게시판",
  stock: "주식게시판",
  crypto: "코인게시판",
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
  }, [isLoaded, isSignedIn, user, userId, router])

  const loadProfile = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/profile/me")
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
        setNickname(data.nickname || user?.username || "")
      }
    } catch (error) {
      console.error("Failed to load profile:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadFollowedCommunities = async () => {
    try {
      const response = await fetch("/api/community/follows")
      if (response.ok) {
        const data = await response.json()
        setFollowedCommunities(data.communities || [])
      }
    } catch (error) {
      console.error("Failed to load followed communities:", error)
    }
  }

  const handleSaveProfile = async () => {
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요.")
      return
    }

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })

      if (response.ok) {
        const updatedProfile = await response.json()
        setProfile(updatedProfile)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        const error = await response.json()
        alert(error.error || "저장에 실패했습니다.")
      }
    } catch (error) {
      console.error("Failed to save profile:", error)
      alert("저장 중 오류가 발생했습니다.")
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
    } catch (error) {
      console.error("Failed to unfollow community:", error)
    }
  }

  const handleChangePassword = () => {
    // Clerk의 비밀번호 변경 페이지로 이동
    if (user) {
      window.open("https://accounts.clerk.dev/user/security", "_blank")
    }
  }

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch("/api/profile/me", {
        method: "DELETE",
      })

      if (response.ok) {
        await signOut()
        router.push("/")
      } else {
        alert("계정 삭제에 실패했습니다.")
      }
    } catch (error) {
      console.error("Failed to delete account:", error)
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

      <main className="mx-auto px-4 py-6 max-w-[600px]">
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
                  <p className="text-sm text-muted-foreground mb-2">
                    프로필 사진은 Clerk 계정에서 변경할 수 있습니다.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("https://accounts.clerk.dev/user", "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Clerk에서 변경
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
                        {communityNames[community.community_slug] || community.community_slug}
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
                비밀번호는 Clerk 계정에서 변경할 수 있습니다.
              </p>

              <Button variant="outline" onClick={handleChangePassword}>
                <ExternalLink className="h-4 w-4 mr-2" />
                비밀번호 변경
              </Button>
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
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
