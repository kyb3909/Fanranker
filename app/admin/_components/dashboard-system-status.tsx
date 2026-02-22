'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database, Rss, Clock } from 'lucide-react'

interface SyncStatus {
  betmanSync: {
    lastSync: string | null
    status: 'ok' | 'stale' | 'error'
  }
  crawler: {
    lastRun: string | null
    itemCount: number
  }
  dailyRound: {
    currentRound: number | null
    resetAt: string | null
  }
}

function StatusBadge({ status }: { status: 'ok' | 'stale' | 'error' }) {
  const variants: Record<string, { label: string; className: string }> = {
    ok: { label: '정상', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    stale: { label: '지연', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    error: { label: '오류', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  }
  const v = variants[status] ?? variants.error
  return <Badge className={v.className}>{v.label}</Badge>
}

import { formatKoreanTime } from "@/lib/utils/date"

export function DashboardSystemStatus({ data }: { data: SyncStatus }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Betman 동기화</CardTitle>
            <StatusBadge status={data.betmanSync.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>마지막 동기화: {formatKoreanTime(data.betmanSync.lastSync)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">뉴스 크롤러</CardTitle>
            <Badge variant="secondary">{data.crawler.itemCount}건</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Rss className="h-3.5 w-3.5" />
            <span>마지막 실행: {formatKoreanTime(data.crawler.lastRun)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">일일 라운드</CardTitle>
            <Badge variant="outline">R{data.dailyRound.currentRound ?? '-'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>리셋 시각: {formatKoreanTime(data.dailyRound.resetAt)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
