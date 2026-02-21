'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Rss } from 'lucide-react'

interface CrawlerStatusData {
  totalRuns: number
  lastRun: {
    sourceId: string
    status: string
    itemsFetched: number
    itemsSaved: number
    finishedAt: string | null
  } | null
}

export function CrawlerStatus({ data }: { data: CrawlerStatusData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rss className="h-4 w-4 text-green-600" />
          <CardTitle className="text-sm font-medium">크롤러 상태</CardTitle>
          {data.lastRun && (
            <Badge
              variant={data.lastRun.status === 'success' ? 'default' : 'destructive'}
              className="text-xs ml-auto"
            >
              {data.lastRun.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex justify-between text-muted-foreground">
          <span>총 실행</span>
          <span>{data.totalRuns}회</span>
        </div>
        {data.lastRun && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>최근 소스</span>
              <span>{data.lastRun.sourceId}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>수집/저장</span>
              <span>{data.lastRun.itemsFetched}/{data.lastRun.itemsSaved}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
