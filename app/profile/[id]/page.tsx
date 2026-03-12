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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  const isCurrentUser = !!(isSignedIn && user?.id === userId)

  if (isCurrentUser) {
    return <MyProfileSettings />
  }

  return <PublicProfileView userId={userId} />
}
