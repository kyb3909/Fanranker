'use client'

import { useCallback, useState } from 'react'
import type { GameModeConfig, DraftPlayer, RoomParticipant, DraftPick, DraftRoom } from '@/lib/draft/types'
import { SEAT_COLORS } from '@/lib/draft/utils'
import { useDraftTimer } from '@/hooks/use-draft-timer'
import { PickTimer } from './pick-timer'
import { DraftOrderBar } from './draft-order-bar'
import { PlayerPool } from './player-pool'
import { TeamDisplay } from './team-display'
import { PickHistory } from './pick-history'

interface DraftBoardProps {
  room: DraftRoom
  participants: RoomParticipant[]
  picks: DraftPick[]
  availablePlayers: DraftPlayer[]
  allPlayers: DraftPlayer[]
  config: GameModeConfig
  mySeatIndex: number | null
  isMyTurn: boolean
  budgets: Record<number, number>
  positionCounts: Record<number, Record<string, number>>
  onPick: (playerId: string) => Promise<unknown>
  onAutoPick: () => Promise<unknown>
}

export function DraftBoard({
  room,
  participants,
  picks,
  availablePlayers,
  allPlayers,
  config,
  mySeatIndex,
  isMyTurn,
  budgets,
  positionCounts,
  onPick,
  onAutoPick,
}: DraftBoardProps) {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTimeout = useCallback(async () => {
    if (!isMyTurn) return
    try {
      await onAutoPick()
    } catch {
      // auto-pick failure is handled server-side
    }
  }, [isMyTurn, onAutoPick])

  const { remaining, isWarning, progress } = useDraftTimer({
    deadlineAt: room.pick_deadline_at,
    isMyTurn,
    timerSeconds: config.timerSeconds,
    onTimeout: handleTimeout,
  })

  const handlePick = async (playerId: string) => {
    if (picking || !isMyTurn) return
    setPicking(true)
    setError(null)
    try {
      await onPick(playerId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '선택에 실패했습니다')
    } finally {
      setPicking(false)
    }
  }

  const totalPicks = config.teamCount * config.picksPerTeam
  const currentSeat = room.snake_order[room.current_pick]
  const currentPlayer = participants.find(p => p.seat_index === currentSeat)

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-4 h-full">
      {/* Left Column - My Team */}
      <div className="lg:w-[280px] shrink-0 space-y-3">
        {mySeatIndex !== null && (
          <TeamDisplay
            seatIndex={mySeatIndex}
            displayName={participants.find(p => p.seat_index === mySeatIndex)?.display_name || '나'}
            picks={picks.filter(p => p.seat_index === mySeatIndex)}
            allPlayers={allPlayers}
            budget={budgets[mySeatIndex] ?? config.salaryCap}
            salaryCap={config.salaryCap}
            salaryUnit={config.salaryUnit}
            positionCounts={positionCounts[mySeatIndex] ?? {}}
            positions={config.positions}
            isCurrent={currentSeat === mySeatIndex}
            isMe
          />
        )}
      </div>

      {/* Center Column - Timer + Order + Player Pool */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Turn info */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${SEAT_COLORS[currentSeat]?.bg}`} />
              <span className="text-sm font-semibold">
                {isMyTurn ? '내 턴!' : `${currentPlayer?.display_name || '???'}의 턴`}
              </span>
              <span className="text-xs text-muted-foreground">
                Pick #{room.current_pick + 1}/{totalPicks}
              </span>
            </div>
            <div className="w-24">
              <PickTimer remaining={remaining} isWarning={isWarning} progress={progress} />
            </div>
          </div>

          <DraftOrderBar
            snakeOrder={room.snake_order}
            currentPick={room.current_pick}
            totalPicks={totalPicks}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        {/* Player pool */}
        <div className="flex-1 rounded-xl border border-border bg-card p-3 min-h-0 overflow-hidden flex flex-col">
          <PlayerPool
            players={availablePlayers}
            salaryUnit={config.salaryUnit}
            isMyTurn={isMyTurn && !picking}
            positionCounts={mySeatIndex !== null ? (positionCounts[mySeatIndex] ?? {}) : {}}
            positions={config.positions}
            remainingBudget={mySeatIndex !== null ? (budgets[mySeatIndex] ?? 0) : 0}
            onPick={handlePick}
          />
        </div>
      </div>

      {/* Right Column - Other Teams + Pick History */}
      <div className="lg:w-[280px] shrink-0 space-y-3 overflow-y-auto">
        {/* Other teams */}
        {participants
          .filter(p => p.seat_index !== mySeatIndex)
          .map(p => (
            <TeamDisplay
              key={p.seat_index}
              seatIndex={p.seat_index}
              displayName={p.display_name}
              picks={picks.filter(pk => pk.seat_index === p.seat_index)}
              allPlayers={allPlayers}
              budget={budgets[p.seat_index] ?? config.salaryCap}
              salaryCap={config.salaryCap}
              salaryUnit={config.salaryUnit}
              positionCounts={positionCounts[p.seat_index] ?? {}}
              positions={config.positions}
              isCurrent={currentSeat === p.seat_index}
              isMe={false}
            />
          ))
        }

        {/* Pick history */}
        <div className="rounded-xl border border-border bg-card p-3">
          <PickHistory
            picks={picks}
            participants={participants}
            allPlayers={allPlayers}
            salaryUnit={config.salaryUnit}
          />
        </div>
      </div>
    </div>
  )
}
