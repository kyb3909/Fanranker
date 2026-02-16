"use client"

import { useDroppable } from "@dnd-kit/core"
import { PlayerCard } from "./player-card"
import type { Team } from "@/lib/draft/types"

interface TeamBoardProps {
  team: Team
  isActive: boolean
  picksPerTeam: number
}

export function TeamBoard({ team, isActive, picksPerTeam }: TeamBoardProps) {
  const { isOver, setNodeRef } = useDroppable({ id: team.id })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 transition-all p-3 ${
        isActive
          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
          : isOver
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full bg-gradient-to-br ${team.color}`} />
          <span className="text-sm font-bold text-foreground">{team.name}</span>
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{team.players.length}/{picksPerTeam}</span>
          <span className="font-mono font-bold text-foreground">${team.budget}</span>
        </div>
      </div>

      {/* Players grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {team.players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, picksPerTeam - team.players.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-[3/4] rounded-lg border border-dashed border-border/50 bg-muted/20"
          />
        ))}
      </div>
    </div>
  )
}
