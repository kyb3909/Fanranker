"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Radio, Users, Clock } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

const SPORT_EMOJI: Record<string, string> = {
  football: "⚽",
  soccer: "⚽",
  baseball: "⚾",
  basketball: "🏀",
  volleyball: "🏐",
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  waiting: { label: "대기중", color: "bg-yellow-500" },
  live: { label: "LIVE", color: "bg-red-500" },
  ended: { label: "종료", color: "bg-gray-500" },
}

interface LiveRoom {
  id: string
  name: string
  sport: string
  status: string
  created_at: string
  game_id: string | null
  betman_games: {
    id: string
    home_team_name: string
    away_team_name: string
    match_time: string
    status: string
    sport: string
    league_code: string | null
  } | null
}

export default function LiveRoomsPage() {
  const {
    data,
    isLoading,
    mutate: mutateRooms,
  } = useSWR("/api/live-rooms", fetcher, {
    refreshInterval: 30_000,
  })

  // 라이브 경기가 있으면 wisetoto 30초 폴링
  const hasActiveRooms = (data?.rooms ?? []).some(
    (r: { status: string }) => r.status === "live" || r.status === "waiting"
  )
  useSWR(hasActiveRooms ? "/api/wisetoto/sync" : null, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    onSuccess: () => mutateRooms(),
  })

  const rooms: LiveRoom[] = data?.rooms ?? []

  // 정렬: live > waiting > ended
  const statusOrder: Record<string, number> = { live: 0, waiting: 1, ended: 2 }
  const sorted = [...rooms].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  )

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      <div className="mb-6 flex items-center gap-3">
        <Radio className="text-primary h-6 w-6" />
        <h1 className="text-xl font-bold">라이브 채팅</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <Radio className="text-muted-foreground/40 mx-auto mb-3 h-10 w-10" />
          <h2 className="text-lg font-semibold">진행 중인 경기가 없습니다</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            경기가 시작되면 채팅방이 자동으로 생성됩니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((room) => {
            const game = room.betman_games
            const statusCfg = STATUS_CONFIG[room.status] ?? STATUS_CONFIG.waiting
            const emoji = SPORT_EMOJI[room.sport] || SPORT_EMOJI[game?.sport ?? ""] || "🏟️"
            const matchTime = game?.match_time
              ? new Date(game.match_time).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null

            return (
              <Link key={room.id} href={`/live/${room.id}`}>
                <Card className="hover:bg-muted/50 cursor-pointer p-4 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{emoji}</span>
                        <h3 className="truncate text-sm font-semibold">{room.name}</h3>
                      </div>
                      {game?.league_code && (
                        <p className="text-muted-foreground mt-0.5 text-xs">{game.league_code}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {matchTime && (
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {matchTime}
                        </span>
                      )}
                      <Badge
                        variant={room.status === "live" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {room.status === "live" && (
                          <span
                            className={`mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full ${statusCfg.color}`}
                          />
                        )}
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
