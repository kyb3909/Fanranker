"use client"

import { useEffect } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// 설정 페이지는 프로필 페이지로 리다이렉트
export default function SettingsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn || !user) {
      router.push("/")
      return
    }

    // 프로필 페이지로 리다이렉트
    router.replace(`/profile/${user.id}`)
  }, [isLoaded, isSignedIn, user, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
