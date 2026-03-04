'use client'

interface PickTimerProps {
  remaining: number
  isWarning: boolean
  progress: number
}

export function PickTimer({ remaining, isWarning, progress }: PickTimerProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`text-3xl font-mono font-bold tabular-nums ${
          isWarning ? 'text-primary animate-pulse' : 'text-foreground'
        }`}
      >
        {remaining}
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isWarning ? 'bg-primary' : progress > 50 ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
