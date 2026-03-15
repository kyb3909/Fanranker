"use client"

import { POSITION_COLORS } from "@/lib/draft/players"
import { getSeatLimits, type DraftState } from "@/lib/draft/engine"

interface DraftResultProps {
  state: DraftState
  mySeat: number
  onRestart: () => void
}

export function DraftResult({ state, mySeat, onRestart }: DraftResultProps) {
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="border-border bg-card rounded-2xl border p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-5xl">🏆</div>
          <h1 className="text-foreground mt-3 text-2xl font-black">드래프트 완료!</h1>
          <p className="text-muted-foreground mt-1 text-sm">모든 팀의 로스터가 완성되었습니다</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {state.participants.map((p) => {
            const roster = state.roster[p.seatIndex] || []
            const totalValue = roster.reduce((sum, pl) => sum + pl.price, 0)
            const isMe = p.seatIndex === mySeat

            return (
              <div
                key={p.seatIndex}
                className={`rounded-xl border p-4 ${
                  isMe ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-base font-bold">{p.name}</span>
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-bold">
                      {p.formation}
                    </span>
                    {isMe && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        나
                      </span>
                    )}
                    {p.isAI && (
                      <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
                        AI
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold text-blue-500">
                      £{totalValue.toFixed(1)}
                    </span>
                    <span className="ml-2 font-mono text-xs text-emerald-500">
                      잔여 £{(state.budget[p.seatIndex] ?? 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  {roster
                    .sort((a, b) => {
                      const posOrder = { GK: 0, DF: 1, MF: 2, FW: 3 }
                      return posOrder[a.position] - posOrder[b.position]
                    })
                    .map((player) => (
                      <div
                        key={player.id}
                        className="border-border/30 bg-muted/20 flex items-center gap-2 rounded border px-2 py-1"
                      >
                        <span
                          className={`rounded px-1 py-0.5 text-[9px] font-bold ${POSITION_COLORS[player.position]}`}
                        >
                          {player.position}
                        </span>
                        <span className="text-foreground flex-1 text-xs font-medium">
                          {player.nameKo}
                        </span>
                        <span className="text-muted-foreground text-[10px]">{player.teamKo}</span>
                        <span className="text-muted-foreground font-mono text-[10px] font-semibold">
                          £{player.price.toFixed(1)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={onRestart}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 py-3 text-sm font-bold shadow-lg transition-all"
          >
            다시 하기
          </button>
        </div>
      </div>
    </div>
  )
}
