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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, XCircle, RefreshCw, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface GameMatch {
  id: string
  game_no: number
  sport: string
  game_type: string
  home_team: string
  away_team: string
  match_time: string | null
  status: string | null
  result: string | null
  home_score: number | null
  away_score: number | null
  handicap: number | null
  over_under_line: number | null
  prediction_count: number
}

const SPORT_LABELS: Record<string, string> = {
  '축구': '축구',
  '야구': '야구',
  '농구': '농구',
  '배구': '배구',
  'soccer': '축구',
  'baseball': '야구',
  'basketball': '농구',
  'volleyball': '배구',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  finished: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

const RESULT_LABELS: Record<string, string> = {
  home: '홈승',
  away: '원정승',
  draw: '무승부',
  over: '오버',
  under: '언더',
  odd: '홀',
  even: '짝',
  cancelled: '취소',
}

export function MatchManagementTable() {
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sportFilter, setSportFilter] = useState('all')
  const [search, setSearch] = useState('')

  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), status: statusFilter, sport: sportFilter })
      const response = await fetch(`/api/admin/matches/list?${params}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '경기 목록을 불러오는데 실패했습니다.')
      }
      const data = await response.json()
      setMatches(data.matches || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '경기 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter, sportFilter])

  useEffect(() => {
    fetchMatches()
  }, [fetchMatches])

  const filteredMatches = search
    ? matches.filter(
        (m) =>
          m.home_team.toLowerCase().includes(search.toLowerCase()) ||
          m.away_team.toLowerCase().includes(search.toLowerCase()) ||
          String(m.game_no).includes(search)
      )
    : matches

  const totalPages = Math.ceil(total / 50)

  if (isLoading && matches.length === 0) {
    return (
      <Card>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    )
  }

  if (error && matches.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <XCircle className="h-10 w-10 mb-2 text-destructive" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <Button variant="outline" onClick={fetchMatches} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">경기 관리 (Betman)</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{total.toLocaleString()}개</Badge>
            <Button variant="outline" size="sm" onClick={fetchMatches} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} /> 새로고침
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="팀명 또는 경기번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-9"
          />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="active">진행중</SelectItem>
              <SelectItem value="finished">종료</SelectItem>
              <SelectItem value="cancelled">취소</SelectItem>
              <SelectItem value="unsettled">미정산</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sportFilter} onValueChange={(v) => { setSportFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="종목" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 종목</SelectItem>
              <SelectItem value="축구">축구</SelectItem>
              <SelectItem value="야구">야구</SelectItem>
              <SelectItem value="농구">농구</SelectItem>
              <SelectItem value="배구">배구</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">번호</TableHead>
              <TableHead className="w-[60px]">종목</TableHead>
              <TableHead className="w-[80px]">유형</TableHead>
              <TableHead>홈 vs 원정</TableHead>
              <TableHead className="w-[130px]">경기시간</TableHead>
              <TableHead className="w-[80px] text-center">스코어</TableHead>
              <TableHead className="w-[70px]">결과</TableHead>
              <TableHead className="w-[60px]">조건</TableHead>
              <TableHead className="w-[70px] text-right">예측 수</TableHead>
              <TableHead className="w-[70px]">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  {search ? '검색 결과가 없습니다.' : '경기가 없습니다.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredMatches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell className="font-mono text-xs">{match.game_no}</TableCell>
                  <TableCell className="text-sm">{SPORT_LABELS[match.sport] || match.sport}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {match.game_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{match.home_team}</span>
                    <span className="text-muted-foreground mx-1">vs</span>
                    <span className="font-medium">{match.away_team}</span>
                  </TableCell>
                  <TableCell>
                    {match.match_time ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(match.match_time), 'MM/dd HH:mm')}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {match.home_score !== null && match.away_score !== null
                      ? `${match.home_score} : ${match.away_score}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {match.result ? (
                      <Badge variant="secondary" className="text-xs">
                        {RESULT_LABELS[match.result] || match.result}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {match.game_type === '핸디캡' && match.handicap !== null && (
                      <Badge variant="outline" className="text-xs">H {match.handicap > 0 ? '+' : ''}{match.handicap}</Badge>
                    )}
                    {(match.game_type === '언더오버' || match.game_type === 'SUM') && match.over_under_line !== null && (
                      <Badge variant="outline" className="text-xs">L {match.over_under_line}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {match.prediction_count > 0 ? (
                      <Badge variant="default" className="text-xs">{match.prediction_count}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLORS[match.status || ''] || ''}`}
                    >
                      {match.status === 'active' ? '진행' : match.status === 'finished' ? '종료' : match.status === 'cancelled' ? '취소' : match.status || '-'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()}개 중 {((page - 1) * 50) + 1}-{Math.min(page * 50, total)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {totalPages <= 1 && (
        <div className="p-4 border-t text-sm text-muted-foreground">
          총 {total.toLocaleString()}개의 경기
        </div>
      )}
    </Card>
  )
}
