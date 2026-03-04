"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import { CommissionOrderDetail } from "@/components/commission/order-detail"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params)
  const { user } = useUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}`)
      const result = await res.json()
      if (!res.ok) { setError(result.error); return }

      // Build profiles map
      const profilesMap: Record<string, any> = {}
      result.profiles?.forEach((p: any) => { profilesMap[p.user_id] = p })

      setData({ order: result.order, milestones: result.milestones, profiles: profilesMap })
    } catch {
      setError('데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-primary">{error || '주문을 찾을 수 없습니다.'}</p>
        <Link href="/art/commissions/orders" className="text-primary text-sm mt-2 inline-block hover:underline">주문 목록으로</Link>
      </div>
    )
  }

  return (
    <main id="main-content" tabIndex={-1} className="max-w-2xl mx-auto space-y-5">
      <Link href="/art/commissions/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        주문 목록
      </Link>

      <CommissionOrderDetail
        order={data.order}
        milestones={data.milestones}
        currentUserId={user?.id || ''}
        profiles={data.profiles}
        onRefresh={fetchOrder}
      />
    </main>
  )
}
