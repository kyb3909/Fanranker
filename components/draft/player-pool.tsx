"use client"

import { useState } from "react"
import { Search, X } from "lucide-react"
import { PlayerCard } from "./player-card"
import type { Player } from "@/lib/draft/types"

interface PlayerPoolProps {
  players: Player[]
  draftedIds: Set<string>
  canDraft: boolean
  positions: string[]
}

export function PlayerPool({ players, draftedIds, canDraft, positions }: PlayerPoolProps) {
  const [search, setSearch] = useState("")
  const [posFilter, setPosFilter] = useState("all")
  const [priceFilter, setPriceFilter] = useState("all")

  const hasFilters = search || posFilter !== "all" || priceFilter !== "all"

  const filtered = players.filter((p) => {
    if (draftedIds.has(p.id)) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (posFilter !== "all" && p.position !== posFilter) return false
    if (priceFilter === "low" && p.salary > 5) return false
    if (priceFilter === "mid" && (p.salary < 6 || p.salary > 7)) return false
    if (priceFilter === "high" && p.salary < 8) return false
    return true
  })

  const resetFilters = () => {
    setSearch("")
    setPosFilter("all")
    setPriceFilter("all")
  }

  return (
    <div className="sticky top-4 bg-card border border-border rounded-xl p-3 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="선수 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-2">
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg bg-muted border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">모든 포지션</option>
          {positions.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
        <select
          value={priceFilter}
          onChange={(e) => setPriceFilter(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg bg-muted border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">모든 가격</option>
          <option value="low">저가 (1-5)</option>
          <option value="mid">중가 (6-7)</option>
          <option value="high">고가 (8+)</option>
        </select>
        {hasFilters && (
          <button onClick={resetFilters} className="px-2 py-1.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-[11px] text-muted-foreground mb-2">{filtered.length}명 선택 가능</p>

      {/* Player grid */}
      <div className="overflow-y-auto flex-1 -mr-1 pr-1">
        <div className="grid grid-cols-3 gap-1.5">
          {filtered.map((player) => (
            <PlayerCard key={player.id} player={player} draggable={canDraft} />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            조건에 맞는 선수가 없습니다
          </p>
        )}
      </div>
    </div>
  )
}
