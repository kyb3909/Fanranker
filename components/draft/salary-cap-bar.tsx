'use client'

interface SalaryCapBarProps {
  spent: number
  cap: number
  unit: string
}

export function SalaryCapBar({ spent, cap, unit }: SalaryCapBarProps) {
  const remaining = cap - spent
  const percent = (spent / cap) * 100

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">
          사용 {unit}{spent.toFixed(1)} / {unit}{cap}
        </span>
        <span className={`font-medium ${remaining < 20 ? 'text-primary' : 'text-green-600'}`}>
          잔여 {unit}{remaining.toFixed(1)}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            percent > 85 ? 'bg-primary' : percent > 60 ? 'bg-amber-500' : 'bg-green-500'
          }`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}
