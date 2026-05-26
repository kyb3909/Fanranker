import { redirect } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import { MultiDraftResult } from "@/components/draft/multi-draft-result"
import { getRoomFullState } from "@/lib/draft/multi-engine"
import { getServerPlayers } from "@/lib/draft/server-players"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return {
    title: `드래프트 결과 · ${id.slice(0, 8)}`,
  }
}

export default async function DraftRoomResultPage({ params }: PageProps) {
  const { id } = await params

  const state = await getRoomFullState(id)
  if (!state) {
    redirect("/games/draft/epl?error=room_not_found")
  }

  if (state.status === "waiting") {
    redirect(`/games/draft/epl/room/${id}`)
  }
  if (state.status === "drafting") {
    redirect(`/games/draft/epl/room/${id}/play`)
  }
  if (state.status === "abandoned") {
    redirect("/games/draft/epl?error=room_abandoned")
  }

  const user = await currentUser()

  let myDisplayName: string | null = null
  if (user) {
    const seat = state.seats.find((s) => s.user_id === user.id && !s.left_at)
    if (seat) {
      myDisplayName = seat.display_name
    } else {
      const supabase = createServiceRoleClient()
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("user_id", user.id)
        .maybeSingle<{ nickname: string | null }>()
      myDisplayName = profile?.nickname ?? user.firstName ?? null
    }
  }

  const allPlayers = await getServerPlayers()

  return (
    <MultiDraftResult
      state={state}
      myUserId={user?.id ?? null}
      myDisplayName={myDisplayName}
      allPlayers={allPlayers}
    />
  )
}
