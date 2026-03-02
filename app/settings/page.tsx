"use client"

import { useEffect } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2, User } from "lucide-react"
import { Button } from "@/components/ui/button"

// 설정 페이지는 프로필 페이지로 리다이렉트
export default function SettingsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn && user) {
      // 프로필 페이지로 리다이렉트
      router.replace(`/profile/${user.id}`)
    }
  }, [isLoaded, isSignedIn, user, router])

  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-card border-border max-w-sm rounded-xl border p-8 text-center">
          <User className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
          <h2 className="mb-2 text-lg font-bold">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            마이페이지를 이용하려면 먼저 로그인해주세요.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              홈으로
            </Button>
            <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
    </div>
  )
}
