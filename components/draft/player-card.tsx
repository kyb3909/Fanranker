"use client"

import { useDraggable } from "@dnd-kit/core"
import type { Player } from "@/lib/draft/types"

const POSITION_COLORS: Record<string, string> = {
  // Soccer
  GK: "bg-amber-500",
  DF: "bg-blue-500",
  MF: "bg-emerald-500",
  FW: "bg-rose-500",
  // Basketball
  PG: "bg-purple-500",
  SG: "bg-orange-500",
  SF: "bg-cyan-500",
  PF: "bg-pink-500",
  C: "bg-indigo-500",
  // K-POP
  "보컬": "bg-rose-500",
  "댄스": "bg-violet-500",
  "랩": "bg-amber-500",
  "비주얼": "bg-pink-500",
  // Three Kingdoms
  "무장": "bg-red-500",
  "지장": "bg-blue-500",
  "궁수": "bg-emerald-500",
  "책사": "bg-purple-500",
}

interface PlayerCardProps {
  player: Player
  draggable?: boolean
  isDragging?: boolean
  compact?: boolean
}

export function PlayerCard({ player, draggable = false, isDragging = false, compact = false }: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: player.id,
    data: player,
    disabled: !draggable,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(3deg)`, opacity: 0.8, zIndex: 50 }
    : undefined

  const posColor = POSITION_COLORS[player.position] || "bg-gray-500"

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 text-xs">
        <span className={`${posColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}>{player.position}</span>
        <span className="font-medium text-foreground truncate flex-1">{player.name}</span>
        <span className="text-muted-foreground font-mono">${player.salary}</span>
      </div>
    )
  }

  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`relative aspect-[3/4] rounded-lg border-2 border-black overflow-hidden cursor-${
        draggable ? "grab" : "default"
      } select-none transition-shadow ${isDragging ? "shadow-xl ring-2 ring-primary" : "hover:shadow-lg"}`}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900" />

      {/* Position badge */}
      <div className="absolute top-1.5 left-1.5 z-10">
        <span
          className={`${posColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded drop-shadow-lg`}
        >
          {player.position}
        </span>
      </div>

      {/* Salary */}
      <div className="absolute top-1.5 right-1.5 z-10">
        <span className="text-white text-[10px] font-bold drop-shadow-lg bg-black/40 px-1.5 py-0.5 rounded">
          ${player.salary}
        </span>
      </div>

      {/* Gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 p-1.5 text-center z-10">
        <p className="text-white text-xs font-bold truncate drop-shadow-lg">{player.name}</p>
      </div>
    </div>
  )
}
