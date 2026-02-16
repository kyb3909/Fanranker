"use client"

import { useState } from "react"
import { CommissionPackageCard } from "./package-card"
import { Palette } from "lucide-react"

const TYPE_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'illustration', label: '일러스트' },
  { id: 'character-design', label: '캐릭터 디자인' },
  { id: 'portrait', label: '초상화' },
  { id: 'logo', label: '로고' },
  { id: 'comic-page', label: '만화' },
  { id: 'animation', label: '애니메이션' },
  { id: 'concept-art', label: '컨셉 아트' },
  { id: 'custom', label: '커스텀' },
]

interface CommissionPackage {
  id: string
  artist_id: string
  name: string
  type: string
  description: string
  features: string[]
  price_gold: number
  delivery_days: number
  max_revisions: number
  max_slots: number
  used_slots: number
  is_active: boolean
}

export function CommissionPackageList({ packages }: { packages: CommissionPackage[] }) {
  const [activeType, setActiveType] = useState("all")

  const filtered = activeType === "all"
    ? packages
    : packages.filter(p => p.type === activeType)

  return (
    <div className="space-y-4">
      {/* Type Filter */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveType(filter.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeType === filter.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pkg) => (
            <CommissionPackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Palette className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">이 카테고리에 패키지가 없습니다.</p>
        </div>
      )}
    </div>
  )
}
