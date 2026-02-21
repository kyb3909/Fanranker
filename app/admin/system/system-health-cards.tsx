'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database, Rss, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SystemHealthData {
  betmanSync: {
    lastCheckedAt: string | null
    lastAction: string | null
    gamesCount: number | null
    lastError: string | null
    updatedAt: string | null
  }
  crawler: {
    totalRuns: number
    lastRun: {
      sourceId: string
      status: string
      itemsFetched: number
      itemsSaved: number
      finishedAt: string | null
    } | null
  }
  dailyRound: {
    dailyId: string | null
    status: string | null
    betOpenAt: string | null
    betCloseAt: string | null
    gameCount: number | null
  }
  tickerCount: number
}

function formatTime(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function SyncStatusBadge({ lastChecked, error }: { lastChecked: string | null; error: string | null }) {
  if (error) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">오류</Badge>
  if (!lastChecked) return <Badge variant="secondary">알 수 없음</Badge>
  const hours = (Date.now() - new Date(lastChecked).getTime()) / 3600000
  if (hours < 3) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">정상</Badge>
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">지연</Badge>
}

export function SystemHealthCards({ data }: { data: SystemHealthData }) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">서비스 상태</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Betman Sync */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-medium">Betman 동기화</CardTitle>
              </div>
              <SyncStatusBadge lastChecked={data.betmanSync.lastCheckedAt} error={data.betmanSync.lastError} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">마지막 체크</span>
              <span>{formatTime(data.betmanSync.lastCheckedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">마지막 액션</span>
              <span>{data.betmanSync.lastAction ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">동기화 경기 수</span>
              <span>{data.betmanSync.gamesCount ?? 0}</span>
            </div>
            {data.betmanSync.lastError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs text-red-700 dark:text-red-300">
                {data.betmanSync.lastError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crawler */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rss className="h-4 w-4 text-green-600" />
                <CardTitle className="text-sm font-medium">뉴스 크롤러</CardTitle>
              </div>
              <Badge variant="secondary">{data.tickerCount} 아이템</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">총 실행 횟수</span>
              <span>{data.crawler.totalRuns}</span>
            </div>
            {data.crawler.lastRun && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">최근 소스</span>
                  <span>{data.crawler.lastRun.sourceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">상태</span>
                  <Badge variant={data.crawler.lastRun.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {data.crawler.lastRun.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">수집/저장</span>
                  <span>{data.crawler.lastRun.itemsFetched}/{data.crawler.lastRun.itemsSaved}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily Round */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-600" />
                <CardTitle className="text-sm font-medium">일일 라운드</CardTitle>
              </div>
              <Badge variant="outline">{data.dailyRound.status ?? '-'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">날짜</span>
              <span>{data.dailyRound.dailyId ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">배팅 오픈</span>
              <span>{formatTime(data.dailyRound.betOpenAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">배팅 마감</span>
              <span>{formatTime(data.dailyRound.betCloseAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">경기 수</span>
              <span>{data.dailyRound.gameCount ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
