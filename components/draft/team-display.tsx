'use client'

import type { DraftPick, DraftPlayer, PositionConstraint } from '@/lib/draft/types'
import { SEAT_COLORS } from '@/lib/draft/utils'
import { SalaryCapBar } from './salary-cap-bar'
import { PositionIndicator } from './position-indicator'

interface TeamDisplayProps {
  seatIndex: number
  displayName: string
  picks: DraftPick[]
  allPlayers: DraftPlayer[]
  budget: number
  salaryCap: number
  salaryUnit: string
  positionCounts: Record<string, number>
  positions: PositionConstraint[]
  isCurrent: boolean
  isMe: boolean
}

export function TeamDisplay({
  seatIndex,
  displayName,
  picks,
  allPlayers,
  budget,
  salaryCap,
  salaryUnit,
  positionCounts,
  positions,
  isCurrent,
  isMe,
}: TeamDisplayProps) {
  const color = SEAT_COLORS[seatIndex]
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))
  const spent = salaryCap - budget

  return (
    <div
      className={`rounded-xl border-2 p-3 transition-all ${
        isCurrent ? `${color.light} border-current ${color.text} shadow-md` : 'border-border bg-card'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color.bg}`} />
          <span className="text-sm font-bold text-foreground">
            {displayName}
            {isMe && <span className="text-[10px] ml-1 text-muted-foreground">(나)</span>}
          </span>
        </div>
        {isCurrent && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground animate-pulse">
            선택 중
          </span>
        )}
      </div>

      {/* Budget */}
      <SalaryCapBar spent={spent} cap={salaryCap} unit={salaryUnit} />

      {/* Position */}
      <div className="mt-2">
        <PositionIndicator positions={positions} counts={positionCounts} />
      </div>

      {/* Picked players */}
      <div className="mt-2 space-y-0.5">
        {picks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">아직 픽 없음</p>
        ) : (
          picks.map(pick => {
            const player = playerMap.get(pick.player_id)
            if (!player) return null
            return (
              <div
                key={pick.id}
                className="flex items-center justify-between rounded-md bg-background/50 px-2 py-1 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-muted-foreground w-4">{pick.player_id.split('-').pop()?.startsWith('0') ? '' : ''}{player.position}</span>
                  <span className="font-medium text-foreground">{player.name}</span>
                  {pick.is_auto_pick && (
                    <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">자동</span>
                  )}
                </div>
                <span className="tabular-nums text-muted-foreground">{salaryUnit}{player.cost}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
