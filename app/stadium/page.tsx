"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { ImageMap, type StadiumPin } from "@/components/stadium-map/image-map"
import { toast } from "@/hooks/use-toast"

interface TeamData {
  team_id: string
  team_name: string
  team_short_name: string
  city: string
  pin_x: number
  pin_y: number
  color: string
  stadium_name: string | null
  stadium: {
    level: number
    total_points: number
    fan_count: number
  }
}

export default function StadiumPage() {
  const router = useRouter()
  const { data, isLoading } = useSWR("/api/stadiums/map?league=epl", fetcher, {
    revalidateOnFocus: false,
  })

  const teams: TeamData[] = data?.teams ?? []

  const stadiumPins: StadiumPin[] = teams.map((t) => ({
    team_id: t.team_id,
    name: t.stadium_name || t.city,
    team_name: t.team_name,
    pin_x: t.pin_x,
    pin_y: t.pin_y,
    color: t.color,
    level: t.stadium.level,
    is_open: t.stadium.level >= 10,
  }))

  const handleStadiumClick = useCallback(
    (teamId: string, isOpen: boolean) => {
      if (isOpen) {
        router.push(`/stadium/${teamId}`)
      } else {
        toast({
          title: "건설 대기 중",
          description: "이 경기장은 아직 건설되지 않았습니다.",
        })
      }
    },
    [router]
  )

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0c1e3a] text-white">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm opacity-60">Loading...</p>
      </div>
    )
  }

  return <ImageMap stadiums={stadiumPins} onStadiumClick={handleStadiumClick} />
}
