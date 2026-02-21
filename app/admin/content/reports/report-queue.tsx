'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Eye, Loader2 } from 'lucide-react'

interface Report {
  id: string
  reporter_id: string
  target_type: string
  target_id: string
  reason: string
  description: string | null
  status: string
  assigned_to: string | null
  resolved_at: string | null
  resolution: string | null
  created_at: string
}

const reasonLabels: Record<string, string> = {
  spam: '스팸',
  hate: '혐오',
  misinformation: '허위정보',
  inappropriate: '부적절',
  other: '기타',
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '대기', variant: 'destructive' },
  reviewing: { label: '검토 중', variant: 'default' },
  resolved: { label: '처리됨', variant: 'secondary' },
  dismissed: { label: '기각', variant: 'outline' },
}

export function ReportQueue({ initialReports, total: initialTotal }: { initialReports: Report[]; total: number }) {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')

  const fetchReports = async (status: string) => {
    try {
      const res = await fetch(`/api/admin/content/reports?status=${status}`)
      const data = await res.json()
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    }
  }

  const handleAction = async (reportId: string, action: string) => {
    setLoading(reportId)
    try {
      const res = await fetch('/api/admin/content/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await fetchReports(statusFilter)
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setLoading(null)
    }
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
    fetchReports(status)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Button
            key={key}
            variant={statusFilter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusFilter(key)}
          >
            {cfg.label}
          </Button>
        ))}
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleStatusFilter('all')}
        >
          전체
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">총 {total}건</span>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>유형</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>신고일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                  신고가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {report.target_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {reasonLabels[report.reason] ?? report.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {report.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[report.status]?.variant ?? 'outline'} className="text-xs">
                      {statusConfig[report.status]?.label ?? report.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right">
                    {report.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleAction(report.id, 'reviewing')}
                          disabled={loading === report.id}
                          title="검토 시작"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600"
                          onClick={() => handleAction(report.id, 'resolve')}
                          disabled={loading === report.id}
                          title="처리"
                        >
                          {loading === report.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleAction(report.id, 'dismiss')}
                          disabled={loading === report.id}
                          title="기각"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {report.status === 'reviewing' && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600"
                          onClick={() => handleAction(report.id, 'resolve')}
                          disabled={loading === report.id}
                          title="처리"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleAction(report.id, 'dismiss')}
                          disabled={loading === report.id}
                          title="기각"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
