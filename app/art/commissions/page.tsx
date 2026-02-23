"use client"

import { useState, useEffect, Suspense } from "react"
import { CommissionPackageList } from "@/components/commission/package-list"
import { Loader2, Palette } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

function CommissionMarketContent() {
  const searchParams = useSearchParams()
  const artistId = searchParams.get('artist_id')

  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const url = artistId
          ? `/api/commissions/packages?artist_id=${artistId}`
          : '/api/commissions/packages'
        const res = await fetch(url)
        const data = await res.json()
        if (res.ok) setPackages(data.packages)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchPackages()
  }, [artistId])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">커미션 마켓</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {artistId ? '이 작가의 커미션 패키지' : '작가에게 직접 작품을 의뢰해보세요'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/art/commissions/orders" className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            내 주문
          </Link>
          <Link href="/art/commissions/manage" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            패키지 관리
          </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-20">
          <Palette className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">아직 등록된 커미션 패키지가 없습니다.</p>
          <Link href="/art/commissions/manage" className="text-primary text-sm mt-2 inline-block hover:underline">
            첫 패키지를 등록해보세요
          </Link>
        </div>
      ) : (
        <CommissionPackageList packages={packages} />
      )}
    </div>
  )
}

export default function CommissionMarketPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }>
        <CommissionMarketContent />
      </Suspense>
    </main>
  )
}
