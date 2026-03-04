'use client'

import type { PositionConstraint } from '@/lib/draft/types'

interface PositionIndicatorProps {
  positions: PositionConstraint[]
  counts: Record<string, number>
}

export function PositionIndicator({ positions, counts }: PositionIndicatorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {positions.map(({ position, label, min }) => {
        const count = counts[position] || 0
        const fulfilled = count >= min

        return (
          <div
            key={position}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
              fulfilled
                ? 'bg-green-100 text-green-700'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span>{label}</span>
            <span className={`${fulfilled ? 'text-green-600' : ''}`}>
              {count}/{min}
            </span>
          </div>
        )
      })}
    </div>
  )
}
