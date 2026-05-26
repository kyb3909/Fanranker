import { redirect } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import { WaitingRoom } from "@/components/draft/waiting-room"
import { getRoomWithSeats, joinRoom } from "@/lib/draft/rooms"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return {
    title: `드래프트 대기실 · ${id.slice(0, 8)}`,
    description: "친구가 들어오기를 기다리고 있어요.",
  }
}

export default async function DraftRoomPage({ params }: PageProps) {
  const { id } = await params

  const room = await getRoomWithSeats(id).catch(() => null)
  if (!room) {
    redirect("/games/draft/epl?error=room_not_found")
  }

  const user = await currentUser()

  // 로그인했는데 좌석 안 잡혀 있고 대기 중 + 자리 있으면 자동 join
  if (user && room.status === "waiting") {
    const activeSeats = room.seats.filter((s) => !s.left_at)
    const hasSeat = activeSeats.some((s) => s.user_id === user.id)
    const hasOpenSeat = activeSeats.length < room.max_participants
    if (!hasSeat && hasOpenSeat) {
      const supabase = createServiceRoleClient()
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("user_id", user.id)
        .maybeSingle<{ nickname: string | null }>()
      const displayName = profile?.nickname ?? user.firstName ?? "익명"
      const updated = await joinRoom({
        roomId: id,
        userId: user.id,
        displayName,
      }).catch(() => null)
      if (updated) {
        return <WaitingRoom initialRoom={updated} myUserId={user.id} myDisplayName={displayName} />
      }
    }
  }

  // 진행중이거나 종료된 방 — 좌석 가진 사람만 들어옴, 아니면 setup 으로
  if (room.status !== "waiting") {
    const isMember = user ? room.seats.some((s) => s.user_id === user.id && !s.left_at) : false
    if (!isMember) {
      redirect(`/games/draft/epl?error=room_${room.status}`)
    }
  }

  // 본인 닉네임 — 좌석 있으면 거기서, 없으면 profile 에서
  let myDisplayName: string | null = null
  if (user) {
    const seat = room.seats.find((s) => s.user_id === user.id && !s.left_at)
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

  return (
    <WaitingRoom initialRoom={room} myUserId={user?.id ?? null} myDisplayName={myDisplayName} />
  )
}
