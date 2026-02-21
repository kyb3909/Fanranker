'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface CrawlerRun {
  id: number
  source_id: string
  started_at: string
  finished_at: string | null
  status: string
  items_fetched: number
  items_saved: number
  error_message: string | null
}

function formatTime(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function durationMs(start: string, end: string | null) {
  if (!end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function CrawlerHistory({ runs }: { runs: CrawlerRun[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">크롤러 실행 이력</h2>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>소스</TableHead>
              <TableHead>시작</TableHead>
              <TableHead>소요 시간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">수집</TableHead>
              <TableHead className="text-right">저장</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                  실행 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono text-xs">{run.source_id}</TableCell>
                  <TableCell className="text-xs">{formatTime(run.started_at)}</TableCell>
                  <TableCell className="text-xs">{durationMs(run.started_at, run.finished_at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={run.status === 'success' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{run.items_fetched}</TableCell>
                  <TableCell className="text-right">{run.items_saved}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
