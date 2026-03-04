'use client'

import type { DraftPick, DraftPlayer, RoomParticipant } from '@/lib/draft/types'
import { SEAT_COLORS } from '@/lib/draft/utils'

interface PickHistoryProps {
  picks: DraftPick[]
  participants: RoomParticipant[]
  allPlayers: DraftPlayer[]
  salaryUnit: string
}

export function PickHistory({ picks, participants, allPlayers, salaryUnit }: PickHistoryProps) {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))
  const participantMap = new Map(participants.map(p => [p.seat_index, p]))

  const reversed = [...picks].reverse()

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        픽 히스토리
      </h3>
      {reversed.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">아직 픽이 없습니다</p>
      ) : (
        <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
          {reversed.map(pick => {
            const player = playerMap.get(pick.player_id)
            const participant = participantMap.get(pick.seat_index)
            const color = SEAT_COLORS[pick.seat_index]

            return (
              <div
                key={pick.id}
                className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
              >
                <span className="text-muted-foreground/60 w-5 text-right tabular-nums">
                  #{pick.pick_number + 1}
                </span>
                <div className={`w-2 h-2 rounded-full ${color.bg}`} />
                <span className="text-muted-foreground truncate max-w-[60px]">
                  {participant?.display_name || '?'}
                </span>
                <span className="font-medium text-foreground truncate flex-1">
                  {player?.name || '?'}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {salaryUnit}{player?.cost}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
