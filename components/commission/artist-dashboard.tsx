"use client"

import { TrendingUp, Package, CheckCircle, XCircle, Coins } from "lucide-react"

interface Stats {
  total_orders: number
  active_orders: number
  completed_orders: number
  cancelled_orders: number
  total_earned: number
  total_fees: number
  completion_rate: number
}

interface PackageInfo {
  id: string
  name: string
  type: string
  is_active: boolean
  used_slots: number
  max_slots: number
  price_gold: number
}

export function ArtistDashboard({ stats, packages }: { stats: Stats; packages: PackageInfo[] }) {
  const cards = [
    { label: '총 수익', value: `${stats.total_earned.toLocaleString()}G`, icon: Coins, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    { label: '활성 주문', value: stats.active_orders, icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { label: '완료', value: stats.completed_orders, icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
    { label: '완료율', value: `${stats.completion_rate}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ]

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4" />
                <span className="text-[11px] font-medium">{card.label}</span>
              </div>
              <p className="text-xl font-bold">{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Extra Stats */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">총 주문</p>
            <p className="font-bold text-foreground">{stats.total_orders}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">취소</p>
            <p className="font-bold text-foreground">{stats.cancelled_orders}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">수수료 합계</p>
            <p className="font-bold text-foreground">{stats.total_fees.toLocaleString()}G</p>
          </div>
        </div>
      </div>

      {/* Packages */}
      {packages.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-sm text-foreground">내 패키지</h3>
          <div className="space-y-2">
            {packages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${pkg.is_active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                  <span className="text-sm text-foreground">{pkg.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{pkg.used_slots}/{pkg.max_slots} 슬롯</span>
                  <span className="font-medium text-primary">{pkg.price_gold.toLocaleString()}G</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
