"use client"

import { useAuth, useUser } from "@clerk/nextjs"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { PublicProfileView } from "@/components/profile/public-profile"
import { MyProfileSettings } from "@/components/profile/my-profile-settings"

export default function ProfilePage() {
  const params = useParams()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const userId = params.id as string

  if (!isLoaded) {
    return (
      <div className="worldcup-scope flex min-h-[100dvh] items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--wc-mute)" }} />
      </div>
    )
  }

  const isCurrentUser = !!(isSignedIn && user?.id === userId)

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      {isCurrentUser ? <MyProfileSettings /> : <PublicProfileView userId={userId} />}
    </div>
  )
}
