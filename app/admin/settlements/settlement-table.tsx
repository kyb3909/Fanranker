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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface UnsettledMatch {
  id: string
  match_time: string
  time_status: number
  score_home: number | null
  score_away: number | null
  is_settled: boolean
  sport_type?: string
}

export function SettlementManagementTable() {
  const [matches, setMatches] = useState<UnsettledMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  const fetchUnsettledMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/predictions/settle?unsettled_only=true')
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '정산 대기 목록을 불러오는데 실패했습니다.')
      }
      const data = await response.json()
      setMatches(data.matches || [])
    } catch (err) {
      console.error('Failed to fetch unsettled matches:', err)
      setError(err instanceof Error ? err.message : '정산 대기 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnsettledMatches()
  }, [fetchUnsettledMatches])

  const handleSettle = async (matchId: string) => {
    if (processingIds.has(matchId)) return

    setProcessingIds((prev) => new Set(prev).add(matchId))
    try {
      const response = await fetch('/api/predictions/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '정산 처리에 실패했습니다.')
      }

      alert(`정산 완료: ${data.settled_count}개 예측이 처리되었습니다.`)
      // Refresh list
      await fetchUnsettledMatches()
    } catch (err) {
      console.error('Failed to settle match:', err)
      alert(err instanceof Error ? err.message : '정산 처리 중 오류가 발생했습니다.')
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(matchId)
        return next
      })
    }
  }

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
        <div className="flex flex-col items-center justify-center h-64 text-red-500">
          <XCircle className="h-10 w-10 mb-2" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={fetchUnsettledMatches} className="mt-4" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">정산 대기 목록</h2>
        <Button onClick={fetchUnsettledMatches} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> 새로고침
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>경기 ID</TableHead>
              <TableHead>종목</TableHead>
              <TableHead>경기 시간</TableHead>
              <TableHead>스코어</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  정산 대기 중인 경기가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              matches.map((match) => {
                const hasScore = match.score_home !== null && match.score_away !== null
                const isProcessing = processingIds.has(match.id)

                return (
                  <TableRow key={match.id}>
                    <TableCell className="font-mono text-sm">{match.id.slice(0, 8)}...</TableCell>
                    <TableCell>{match.sport_type || '-'}</TableCell>
                    <TableCell>
                      {match.match_time ? format(new Date(match.match_time), 'yyyy-MM-dd HH:mm') : '-'}
                    </TableCell>
                    <TableCell>
                      {hasScore ? (
                        <span className="font-semibold">
                          {match.score_home} - {match.score_away}
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          스코어 없음
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-orange-600">
                        <AlertCircle className="h-4 w-4" /> 정산 대기
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={hasScore ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleSettle(match.id)}
                        disabled={!hasScore || isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            처리 중...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            정산 처리
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
