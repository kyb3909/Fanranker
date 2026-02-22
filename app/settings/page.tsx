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
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-xl p-8 text-center max-w-sm">
          <User className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-bold mb-2">로그인이 필요합니다</h2>
          <p className="text-sm text-muted-foreground mb-4">마이페이지를 이용하려면 먼저 로그인해주세요.</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => router.push("/")}>홈으로</Button>
            <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
