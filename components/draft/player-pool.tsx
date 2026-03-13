"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import { ALL_PLAYERS, POSITION_COLORS, type Player, type Position } from "@/lib/draft/players"
import type { DraftState } from "@/lib/draft/engine"
import { getSeatLimits } from "@/lib/draft/engine"

interface PlayerPoolProps {
  state: DraftState
  myTurn: boolean
  mySeat: number
  onPick: (playerId: string) => void
}

const POS_TABS: { key: Position | "ALL"; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "GK", label: "GK" },
  { key: "DF", label: "DF" },
  { key: "MF", label: "MF" },
  { key: "FW", label: "FW" },
]

export function PlayerPool({ state, myTurn, mySeat, onPick }: PlayerPoolProps) {
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL")
  const [search, setSearch] = useState("")
  const [sortDesc, setSortDesc] = useState(true)

  // 내 포지션 카운트
  const myPosCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const p of state.roster[mySeat] || []) counts[p.position]++
    return counts
  }, [state.roster, mySeat])

  const players = useMemo(() => {
    let list = [...ALL_PLAYERS]

    // 포지션 필터
    if (posFilter !== "ALL") {
      list = list.filter((p: Player) => p.position === posFilter)
    }

    // 검색
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p: Player) =>
          p.nameKo.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.teamKo.toLowerCase().includes(q)
      )
    }

    // 정렬
    list = [...list].sort((a: Player, b: Player) =>
      sortDesc ? b.price - a.price : a.price - b.price
    )

    return list as Player[]
  }, [posFilter, search, sortDesc, state])

  const budget = state.budget[mySeat] ?? 0
  const myLimits = getSeatLimits(state, mySeat)
  const isPosFull = (pos: Position) => myPosCounts[pos] >= myLimits[pos]

  return (
    <div className="flex h-full flex-col">
      {/* 포지션 탭 */}
      <div className="border-border flex items-center gap-1 border-b px-3 py-2">
        {POS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPosFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              posFilter === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key !== "ALL" && (
              <span className="ml-1 opacity-60">
                {myPosCounts[tab.key as Position]}/{myLimits[tab.key as Position]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="border-border relative border-b px-3 py-2">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          placeholder="선수명, 팀명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-muted text-foreground placeholder:text-muted-foreground focus:ring-primary h-8 w-full rounded-md pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-card sticky top-0 z-10">
            <tr className="border-border text-muted-foreground border-b text-xs">
              <th className="px-3 py-2 text-left font-medium">포지션</th>
              <th className="px-2 py-2 text-left font-medium">선수</th>
              <th className="px-2 py-2 text-left font-medium">팀</th>
              <th
                className="hover:text-foreground cursor-pointer px-3 py-2 text-right font-medium"
                onClick={() => setSortDesc(!sortDesc)}
              >
                가격 {sortDesc ? "↓" : "↑"}
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const drafted = state.draftedPlayerIds.has(player.id)
              const tooExpensive = player.price > budget
              const posFull = isPosFull(player.position)
              const disabled = drafted || !myTurn || tooExpensive || posFull

              return (
                <tr
                  key={player.id}
                  onClick={() => !disabled && onPick(player.id)}
                  className={`border-border/50 border-b transition-colors ${
                    drafted
                      ? "opacity-30"
                      : disabled
                        ? "opacity-50"
                        : "hover:bg-primary/5 cursor-pointer"
                  }`}
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${POSITION_COLORS[player.position]}`}
                    >
                      {player.position}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-foreground font-medium">{player.nameKo}</div>
                    <div className="text-muted-foreground text-[11px]">{player.name}</div>
                  </td>
                  <td className="text-muted-foreground px-2 py-2">{player.teamKo}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                    £{player.price.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
