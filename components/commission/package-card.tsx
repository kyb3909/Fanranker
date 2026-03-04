"use client"

import { Clock, RefreshCw, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const TYPE_LABELS: Record<string, string> = {
  'illustration': '일러스트',
  'character-design': '캐릭터 디자인',
  'portrait': '초상화',
  'logo': '로고',
  'comic-page': '만화 페이지',
  'animation': '애니메이션',
  'concept-art': '컨셉 아트',
  'custom': '커스텀',
}

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

export function CommissionPackageCard({ pkg, showOrderButton = true }: { pkg: CommissionPackage; showOrderButton?: boolean }) {
  const slotsAvailable = pkg.max_slots - pkg.used_slots
  const isFull = slotsAvailable <= 0

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-sm text-foreground">{pkg.name}</h3>
          <span className="text-[11px] text-muted-foreground">{TYPE_LABELS[pkg.type] || pkg.type}</span>
        </div>
        <div className="text-right">
          <p className="font-bold text-base text-primary">{pkg.price_gold.toLocaleString()}G</p>
        </div>
      </div>

      {/* Description */}
      {pkg.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{pkg.description}</p>
      )}

      {/* Features */}
      {pkg.features.length > 0 && (
        <ul className="space-y-1">
          {pkg.features.slice(0, 4).map((feature, i) => (
            <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              {feature}
            </li>
          ))}
          {pkg.features.length > 4 && (
            <li className="text-[11px] text-muted-foreground">+{pkg.features.length - 4}개 더</li>
          )}
        </ul>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {pkg.delivery_days}일
        </span>
        <span className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          수정 {pkg.max_revisions}회
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {isFull ? (
            <span className="text-primary">마감</span>
          ) : (
            <>{slotsAvailable}/{pkg.max_slots} 슬롯</>
          )}
        </span>
      </div>

      {/* Order Button */}
      {showOrderButton && (
        <Link href={isFull ? '#' : `/art/commissions/${pkg.id}/order`}>
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            disabled={isFull}
          >
            {isFull ? '슬롯 마감' : '주문하기'}
          </Button>
        </Link>
      )}
    </div>
  )
}
