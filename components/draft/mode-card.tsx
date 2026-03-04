'use client'

import type { GameModeConfig } from '@/lib/draft/types'

interface ModeCardProps {
  mode: GameModeConfig
  onClick: () => void
}

export function ModeCard({ mode, onClick }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{mode.icon}</span>
        <div>
          <h3 className="font-bold text-foreground">{mode.name}</h3>
          <p className="text-xs text-muted-foreground">{mode.category}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {mode.description}
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1">
          {mode.teamCount}명
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1">
          팀당 {mode.picksPerTeam}픽
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1">
          캡 {mode.salaryUnit}{mode.salaryCap}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1">
          {mode.timerSeconds}초
        </span>
      </div>

      <div className="absolute top-3 right-3 text-muted-foreground/50 group-hover:text-primary transition-colors">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
