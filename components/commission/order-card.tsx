"use client"

import Link from "next/link"
import { Clock } from "lucide-react"
import { CommissionStatusBadge } from "./status-badge"

interface OrderCardProps {
  order: {
    id: string
    order_number: string
    title: string
    status: string
    price_gold: number
    client_id: string
    artist_id: string
    delivery_days: number
    deadline_at: string | null
    created_at: string
    commission_packages?: { name: string; type: string } | null
  }
  currentUserId: string
  profiles?: Record<string, { nickname: string; avatar_url: string | null }>
}

export function CommissionOrderCard({ order, currentUserId, profiles }: OrderCardProps) {
  const isClient = order.client_id === currentUserId
  const otherUserId = isClient ? order.artist_id : order.client_id
  const otherNickname = profiles?.[otherUserId]?.nickname || '사용자'
  const roleLabel = isClient ? '작가' : '의뢰인'

  const daysLeft = order.deadline_at
    ? Math.ceil((new Date(order.deadline_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <Link href={`/art/commissions/orders/${order.id}`}>
      <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground">{order.order_number}</p>
            <h3 className="font-bold text-sm text-foreground truncate">{order.title}</h3>
          </div>
          <CommissionStatusBadge status={order.status} />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{roleLabel}: <span className="text-foreground">{otherNickname}</span></span>
          {order.commission_packages && (
            <span>패키지: <span className="text-foreground">{order.commission_packages.name}</span></span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="font-bold text-sm text-primary">{order.price_gold.toLocaleString()}G</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {daysLeft !== null && !['completed', 'cancelled'].includes(order.status) && (
              <span className={`flex items-center gap-1 ${daysLeft < 0 ? 'text-primary' : daysLeft <= 2 ? 'text-orange-500' : ''}`}>
                <Clock className="h-3 w-3" />
                {daysLeft < 0 ? `${Math.abs(daysLeft)}일 초과` : `D-${daysLeft}`}
              </span>
            )}
            <span>{new Date(order.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
