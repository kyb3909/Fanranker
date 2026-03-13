"use client"

import { POSITION_COLORS, POSITION_LABELS, type Player, type Position } from "@/lib/draft/players"

interface MyRosterProps {
  roster: Player[]
  budget: number
  seatName: string
  positionLimits: Record<Position, number>
}

const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"]

export function MyRoster({ roster, budget, seatName, positionLimits }: MyRosterProps) {
  const grouped: Record<Position, Player[]> = { GK: [], DF: [], MF: [], FW: [] }
  for (const p of roster) grouped[p.position].push(p)

  const totalValue = roster.reduce((sum, p) => sum + p.price, 0)

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 */}
      <div className="border-border border-b px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-bold">{seatName}의 로스터</h3>
          <span className="text-muted-foreground text-xs">{roster.length}/11</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="rounded-md bg-emerald-500/10 px-2 py-1">
            <span className="text-muted-foreground text-[10px]">잔여 예산</span>
            <p className="font-mono text-sm font-bold text-emerald-500">£{budget.toFixed(1)}</p>
          </div>
          <div className="rounded-md bg-blue-500/10 px-2 py-1">
            <span className="text-muted-foreground text-[10px]">팀 가치</span>
            <p className="font-mono text-sm font-bold text-blue-500">£{totalValue.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* 포지션별 슬롯 */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {POSITIONS.map((pos) => {
          const players = grouped[pos]
          const limit = positionLimits[pos]
          if (limit === 0) return null
          const emptySlots = Math.max(0, limit - players.length)

          return (
            <div key={pos}>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${POSITION_COLORS[pos]}`}
                >
                  {pos}
                </span>
                <span className="text-muted-foreground text-xs">
                  {POSITION_LABELS[pos]} ({players.length}/{limit})
                </span>
              </div>
              <div className="space-y-1">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="border-border/50 bg-muted/30 flex items-center justify-between rounded-md border px-2.5 py-1.5"
                  >
                    <div>
                      <span className="text-foreground text-sm font-medium">{p.nameKo}</span>
                      <span className="text-muted-foreground ml-1.5 text-[11px]">{p.teamKo}</span>
                    </div>
                    <span className="text-muted-foreground font-mono text-xs font-semibold tabular-nums">
                      £{p.price.toFixed(1)}
                    </span>
                  </div>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${pos}-${i}`}
                    className="border-border/40 text-muted-foreground/50 flex h-8 items-center justify-center rounded-md border border-dashed text-[11px]"
                  >
                    빈 슬롯
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
