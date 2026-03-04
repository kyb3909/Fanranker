"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { ArtistDashboard } from "@/components/commission/artist-dashboard"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { user } = useUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/commissions/dashboard')
        const result = await res.json()
        if (!res.ok) { setError(result.error); return }
        setData(result)
      } catch {
        setError('데이터 로드 실패')
      } finally {
        setLoading(false)
      }
    }
    if (user) fetchDashboard()
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-primary">{error}</p>
        <Link href="/art/commissions" className="text-primary text-sm mt-2 inline-block hover:underline">커미션 마켓으로</Link>
      </div>
    )
  }

  return (
    <main id="main-content" tabIndex={-1} className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/art/commissions" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">작가 대시보드</h1>
          <p className="text-sm text-muted-foreground">수익과 주문 통계를 확인하세요</p>
        </div>
      </div>

      {data && <ArtistDashboard stats={data.stats} packages={data.packages} />}
    </main>
  )
}
