'use client'

import { useState, useMemo } from 'react'
import type { DraftPlayer, PositionConstraint } from '@/lib/draft/types'
import { PlayerCard } from './player-card'

interface PlayerPoolProps {
  players: DraftPlayer[]
  salaryUnit: string
  isMyTurn: boolean
  positionCounts: Record<string, number>
  positions: PositionConstraint[]
  remainingBudget: number
  onPick: (playerId: string) => void
}

type SortKey = 'cost-desc' | 'cost-asc' | 'name'

export function PlayerPool({
  players,
  salaryUnit,
  isMyTurn,
  positionCounts,
  positions,
  remainingBudget,
  onPick,
}: PlayerPoolProps) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('cost-desc')

  const filtered = useMemo(() => {
    let list = players

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        p => p.name.toLowerCase().includes(q) ||
             p.nameEn?.toLowerCase().includes(q) ||
             p.team?.toLowerCase().includes(q) ||
             p.teamEn?.toLowerCase().includes(q)
      )
    }

    if (posFilter !== 'all') {
      list = list.filter(p => p.position === posFilter)
    }

    switch (sort) {
      case 'cost-desc': list = [...list].sort((a, b) => b.cost - a.cost); break
      case 'cost-asc': list = [...list].sort((a, b) => a.cost - b.cost); break
      case 'name': list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
    }

    return list
  }, [players, search, posFilter, sort])

  const uniquePositions = useMemo(() =>
    Array.from(new Set(players.map(p => p.position))),
    [players]
  )

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Search */}
      <input
        type="text"
        placeholder="선수/팀 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setPosFilter('all')}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            posFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          전체 ({players.length})
        </button>
        {uniquePositions.map(pos => (
          <button
            key={pos}
            onClick={() => setPosFilter(posFilter === pos ? 'all' : pos)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              posFilter === pos ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {pos} ({players.filter(p => p.position === pos).length})
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex gap-1.5 text-xs">
        {[
          { key: 'cost-desc' as SortKey, label: '몸값 높은순' },
          { key: 'cost-asc' as SortKey, label: '몸값 낮은순' },
          { key: 'name' as SortKey, label: '이름순' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`px-2 py-0.5 rounded transition-colors ${
              sort === s.key ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Player List */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">결과 없음</p>
        ) : (
          filtered.map(player => {
            const constraint = positions.find(c => c.position === player.position)
            const count = positionCounts[player.position] || 0
            const positionFull = constraint ? count >= constraint.max : false

            return (
              <PlayerCard
                key={player.id}
                player={player}
                salaryUnit={salaryUnit}
                disabled={!isMyTurn || player.cost > remainingBudget}
                positionFull={positionFull}
                onPick={onPick}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
