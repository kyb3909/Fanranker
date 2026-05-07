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
      <div className="worldcup-scope flex min-h-[100dvh] items-center justify-center px-4 py-20">
        <div
          className="max-w-sm rounded-xl p-8 text-center"
          style={{
            background: "var(--wc-card, #ffffff)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <User className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--wc-mute, #7a6b65)" }} />
          <h2 className="mb-2 text-lg font-bold" style={{ color: "var(--wc-ink, #1a1416)" }}>
            로그인이 필요합니다
          </h2>
          <p className="mb-4 text-sm" style={{ color: "var(--wc-mute, #7a6b65)" }}>
            마이페이지를 이용하려면 먼저 로그인해주세요.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              홈으로
            </Button>
            <Button
              onClick={() => router.push("/sign-up")}
              style={{ background: "var(--wc-burgundy, #a0203b)", color: "white" }}
            >
              로그인 / 가입
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="worldcup-scope flex min-h-[100dvh] items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--wc-mute, #7a6b65)" }} />
    </div>
  )
}
