'use client'

import type { DraftPlayer, PositionConstraint } from '@/lib/draft/types'

interface PlayerCardProps {
  player: DraftPlayer
  salaryUnit: string
  disabled: boolean
  onPick: (playerId: string) => void
  positionFull: boolean
}

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-amber-100 text-amber-700',
  DF: 'bg-blue-100 text-blue-700',
  MF: 'bg-green-100 text-green-700',
  FW: 'bg-primary/15 text-primary',
}

export function PlayerCard({ player, salaryUnit, disabled, onPick, positionFull }: PlayerCardProps) {
  const posColor = POSITION_COLORS[player.position] || 'bg-muted text-muted-foreground'
  const isDisabled = disabled || positionFull

  return (
    <button
      onClick={() => onPick(player.id)}
      disabled={isDisabled}
      className={`flex items-center gap-3 w-full rounded-lg border px-3 py-2 text-left transition-all ${
        isDisabled
          ? 'border-border/50 bg-muted/30 opacity-50 cursor-not-allowed'
          : 'border-border hover:border-primary/50 hover:bg-accent/50 active:scale-[0.99]'
      }`}
    >
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${posColor}`}>
        {player.position}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{player.name}</p>
        {player.team && (
          <p className="text-[11px] text-muted-foreground truncate">{player.team}</p>
        )}
      </div>

      <span className="shrink-0 text-sm font-bold text-foreground tabular-nums">
        {salaryUnit}{player.cost}
      </span>
    </button>
  )
}
