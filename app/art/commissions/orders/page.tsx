"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { CommissionOrderCard } from "@/components/commission/order-card"
import { Loader2, Package, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function OrdersListPage() {
  const { user } = useUser()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'client' | 'artist'>('all')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true)
      try {
        let url = `/api/commissions/orders?role=${activeTab === 'all' ? '' : activeTab}`
        if (statusFilter) url += `&status=${statusFilter}`
        const res = await fetch(url)
        const data = await res.json()
        if (res.ok) setOrders(data.orders)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    if (user) fetchOrders()
  }, [user, activeTab, statusFilter])

  const statusOptions = [
    { value: '', label: '전체' },
    { value: 'pending', label: '대기중' },
    { value: 'accepted', label: '수락됨' },
    { value: 'in_progress', label: '작업중' },
    { value: 'review', label: '검토중' },
    { value: 'completed', label: '완료' },
    { value: 'cancelled', label: '취소' },
  ]

  return (
    <main id="main-content" tabIndex={-1} className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/art/commissions" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">내 주문</h1>
          <p className="text-sm text-muted-foreground">커미션 주문 내역을 확인하세요</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {[
            { value: 'all' as const, label: '전체' },
            { value: 'client' as const, label: '의뢰한 주문' },
            { value: 'artist' as const, label: '받은 주문' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">주문이 없습니다.</p>
          <Link href="/art/commissions" className="text-primary text-sm mt-2 inline-block hover:underline">커미션 마켓 둘러보기</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <CommissionOrderCard
              key={order.id}
              order={order}
              currentUserId={user?.id || ''}
            />
          ))}
        </div>
      )}
    </main>
  )
}
