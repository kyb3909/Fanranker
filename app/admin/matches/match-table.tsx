'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Loader2, XCircle, RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface MatchWithStats {
  match_id: string
  sport_type: string
  match_time: string | null
  prediction_count: number
  is_prediction_open: boolean | null
}

export function MatchManagementTable() {
  const [matches, setMatches] = useState<MatchWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/matches/list')
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('경기 조회 API가 아직 구현되지 않았습니다.')
        }
        const errorData = await response.json()
        throw new Error(errorData.error || '경기 목록을 불러오는데 실패했습니다.')
      }
      const data = await response.json()
      setMatches(data.matches || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '경기 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMatches()
  }, [fetchMatches])

  if (isLoading) {
    return (
      <Card>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <XCircle className="h-10 w-10 mb-2 text-primary" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <p className="text-xs text-muted-foreground mt-4 max-w-md">
            경기 관리 기능을 사용하려면 <code className="bg-muted px-2 py-1 rounded">/api/admin/matches/list</code> API
            엔드포인트가 필요합니다.
          </p>
          <button onClick={fetchMatches} className="mt-4 px-4 py-2 text-sm border rounded hover:bg-muted">
            <RefreshCw className="h-4 w-4 inline mr-2" /> 다시 시도
          </button>
        </div>
      </Card>
    )
  }

  const sportLabels: Record<string, string> = {
    soccer: '축구',
    baseball: '야구',
    basketball: '농구',
    volleyball: '배구',
  }

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">예측된 경기 목록</h2>
        <button
          onClick={fetchMatches}
          className="px-4 py-2 text-sm border rounded hover:bg-muted flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> 새로고침
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>경기 ID</TableHead>
              <TableHead>종목</TableHead>
              <TableHead>경기 시간</TableHead>
              <TableHead className="text-right">예측 수</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  예측된 경기가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              matches.map((match) => {
                const isUpcoming = match.match_time ? new Date(match.match_time) > new Date() : false
                const isOpen = match.is_prediction_open !== false

                return (
                  <TableRow key={match.match_id}>
                    <TableCell className="font-mono text-sm">{match.match_id.slice(0, 8)}...</TableCell>
                    <TableCell>{sportLabels[match.sport_type] || match.sport_type}</TableCell>
                    <TableCell>
                      {match.match_time ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(match.match_time), 'yyyy-MM-dd HH:mm')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{match.prediction_count}</TableCell>
                    <TableCell>
                      {isUpcoming && isOpen ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" /> 예측 가능
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <AlertCircle className="h-4 w-4" /> 마감
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="p-4 border-t text-sm text-muted-foreground">
        총 {matches.length}개의 경기
      </div>
    </Card>
  )
}
