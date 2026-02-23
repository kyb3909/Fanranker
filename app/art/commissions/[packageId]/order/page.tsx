"use client"

import { use, useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { CommissionOrderForm } from "@/components/commission/order-form"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

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

export default function OrderPage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = use(params)
  const { user } = useUser()
  const router = useRouter()

  const [pkg, setPkg] = useState<CommissionPackage | null>(null)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        // Fetch package - we get all packages and find ours
        const pkgRes = await fetch(`/api/commissions/packages`)
        const pkgData = await pkgRes.json()
        const found = pkgData.packages?.find((p: CommissionPackage) => p.id === packageId)
        if (!found) { setError('패키지를 찾을 수 없습니다.'); return }
        setPkg(found)

        // Fetch gold balance
        const goldRes = await fetch('/api/payments/purchase')
        if (goldRes.ok) {
          const goldData = await goldRes.json()
          setBalance(goldData.balance || 0)
        }
      } catch {
        setError('데이터 로드 실패')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [packageId])

  const handleSubmit = async (data: { title: string; description: string; reference_images: string[] }) => {
    const res = await fetch('/api/commissions/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId, ...data }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error)
    router.push(`/art/commissions/orders/${result.order.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !pkg) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-500">{error || '패키지를 찾을 수 없습니다.'}</p>
        <Link href="/art/commissions" className="text-primary text-sm mt-2 inline-block hover:underline">커미션 마켓으로</Link>
      </div>
    )
  }

  return (
    <main id="main-content" tabIndex={-1} className="max-w-lg mx-auto space-y-5">
      <Link href="/art/commissions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        커미션 마켓
      </Link>

      <div>
        <h1 className="text-xl font-bold text-foreground">커미션 주문서</h1>
        <p className="text-sm text-muted-foreground mt-0.5">주문 내용을 작성해주세요</p>
      </div>

      <CommissionOrderForm
        packageData={pkg}
        userBalance={balance}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
