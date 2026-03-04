'use client'

import type { DraftResult, DraftPlayer, RoomParticipant } from '@/lib/draft/types'
import { SEAT_COLORS } from '@/lib/draft/utils'
import Link from 'next/link'

interface GameResultProps {
  results: DraftResult[]
  participants: RoomParticipant[]
  allPlayers: DraftPlayer[]
  salaryUnit: string
  myUserId: string | null
}

export function GameResult({ results, participants, allPlayers, salaryUnit, myUserId }: GameResultProps) {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))
  const participantMap = new Map(participants.map(p => [p.user_id, p]))

  // Sort by total_cost desc (highest spender first as simple ranking)
  const sorted = [...results].sort((a, b) => b.total_cost - a.total_cost)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">드래프트 완료!</h2>
        <p className="text-sm text-muted-foreground mt-1">모든 참가자에게 10 골드가 지급되었습니다</p>
      </div>

      <div className="space-y-4">
        {sorted.map((result, index) => {
          const participant = participantMap.get(result.user_id)
          const color = SEAT_COLORS[result.seat_index]
          const isMe = result.user_id === myUserId
          const players = result.player_ids.map(id => playerMap.get(id)).filter(Boolean) as DraftPlayer[]

          return (
            <div
              key={result.id}
              className={`rounded-xl border-2 p-4 ${
                isMe ? `${color.light} border-current ${color.text}` : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                  <div className={`w-3 h-3 rounded-full ${color.bg}`} />
                  <span className="font-bold text-foreground">
                    {participant?.display_name || '???'}
                    {isMe && <span className="text-xs ml-1 text-muted-foreground">(나)</span>}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{salaryUnit}{result.total_cost.toFixed(1)}</p>
                  <p className="text-[10px] text-amber-600">+{result.gold_rewarded} 골드</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {players.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-md bg-background/70 px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-muted-foreground">{player.position}</span>
                      <span className="font-medium text-foreground truncate">{player.name}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums ml-1">{salaryUnit}{player.cost}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 justify-center">
        <Link
          href="/games/draft"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          새 게임
        </Link>
      </div>
    </div>
  )
}
