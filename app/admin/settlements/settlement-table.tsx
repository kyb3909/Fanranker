'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Trophy,
  Clock,
  Filter,
  Pencil,
  Ban,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface UnsettledGame {
  id: string
  game_no: number
  sport: string
  game_type: string
  home_team: string
  away_team: string
  match_time: string
  status: string
  result: string | null
  home_score: number | null
  away_score: number | null
  daily_round_id: string | null
  has_result: boolean
}

const sportLabels: Record<string, string> = {
  soccer: '축구',
  basketball: '농구',
  baseball: '야구',
  volleyball: '배구',
  hockey: '하키',
  esports: 'e스포츠',
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: '예정', variant: 'outline' },
  in_progress: { label: '진행중', variant: 'default' },
  completed: { label: '완료', variant: 'secondary' },
  cancelled: { label: '취소', variant: 'destructive' },
}

const RESULT_OPTIONS: Record<string, { label: string; value: string }[]> = {
  '일반': [
    { label: '홈 승', value: 'home' },
    { label: '무승부', value: 'draw' },
    { label: '원정 승', value: 'away' },
  ],
  '핸디캡': [
    { label: '홈 승', value: 'home' },
    { label: '무승부', value: 'draw' },
    { label: '원정 승', value: 'away' },
  ],
  '언더오버': [
    { label: '오버', value: 'over' },
    { label: '언더', value: 'under' },
  ],
  'SUM': [
    { label: '홀', value: 'odd' },
    { label: '짝', value: 'even' },
  ],
}

function getResultOptions(gameType: string) {
  return RESULT_OPTIONS[gameType] || RESULT_OPTIONS['일반']
}

function deriveResult(gameType: string, homeScore: number, awayScore: number): string {
  if (gameType === '언더오버' || gameType === 'SUM') return ''
  if (homeScore > awayScore) return 'home'
  if (homeScore < awayScore) return 'away'
  return 'draw'
}

export function SettlementManagementTable() {
  const [matches, setMatches] = useState<UnsettledGame[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [settlingRound, setSettlingRound] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState<string>('all')

  // 결과 입력 다이얼로그 상태
  const [editGame, setEditGame] = useState<UnsettledGame | null>(null)
  const [editHomeScore, setEditHomeScore] = useState('')
  const [editAwayScore, setEditAwayScore] = useState('')
  const [editResult, setEditResult] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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
      setError(err instanceof Error ? err.message : '정산 대기 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnsettledMatches()
  }, [fetchUnsettledMatches])

  const openResultDialog = (game: UnsettledGame) => {
    setEditGame(game)
    setEditHomeScore(game.home_score !== null ? String(game.home_score) : '')
    setEditAwayScore(game.away_score !== null ? String(game.away_score) : '')
    setEditResult(game.result || '')
  }

  const closeResultDialog = () => {
    setEditGame(null)
    setEditHomeScore('')
    setEditAwayScore('')
    setEditResult('')
  }

  const handleScoreChange = (side: 'home' | 'away', value: string) => {
    const numVal = value === '' ? '' : value.replace(/\D/g, '')
    if (side === 'home') setEditHomeScore(numVal)
    else setEditAwayScore(numVal)

    if (editGame && numVal !== '' && (side === 'home' ? editAwayScore : editHomeScore) !== '') {
      const h = side === 'home' ? parseInt(numVal, 10) : parseInt(editHomeScore, 10)
      const a = side === 'away' ? parseInt(numVal, 10) : parseInt(editAwayScore, 10)
      if (!isNaN(h) && !isNaN(a)) {
        const auto = deriveResult(editGame.game_type, h, a)
        if (auto) setEditResult(auto)
      }
    }
  }

  const handleSaveResult = async () => {
    if (!editGame) return
    if (editHomeScore === '' || editAwayScore === '' || !editResult) {
      toast({ variant: 'destructive', title: '입력 오류', description: '스코어와 결과를 모두 입력해주세요.' })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/matches/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: [{
            game_id: editGame.id,
            home_score: parseInt(editHomeScore, 10),
            away_score: parseInt(editAwayScore, 10),
            result: editResult,
          }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '결과 저장에 실패했습니다.')

      toast({ title: '결과 입력 완료', description: data.message })
      closeResultDialog()
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: err instanceof Error ? err.message : '결과 저장 중 오류가 발생했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelGame = async (game: UnsettledGame) => {
    if (!confirm(`${game.home_team} vs ${game.away_team} 경기를 취소 처리하시겠습니까?\n베팅한 유저에게 토큰이 환불됩니다.`)) {
      return
    }

    setProcessingIds((prev) => new Set(prev).add(`cancel-${game.id}`))
    try {
      const response = await fetch('/api/admin/matches/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: [{
            game_id: game.id,
            home_score: 0,
            away_score: 0,
            result: 'cancelled',
          }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '취소 처리에 실패했습니다.')

      toast({ title: '경기 취소 완료', description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: err instanceof Error ? err.message : '취소 처리 중 오류가 발생했습니다.',
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(`cancel-${game.id}`)
        return next
      })
    }
  }

  const handleSettleByRound = async (dailyRoundId: string) => {
    if (settlingRound) return
    setSettlingRound(dailyRoundId)
    try {
      const response = await fetch('/api/predictions/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_round_id: dailyRoundId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '정산 처리에 실패했습니다.')
      toast({ title: '정산 완료', description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: err instanceof Error ? err.message : '정산 처리 중 오류가 발생했습니다.',
      })
    } finally {
      setSettlingRound(null)
    }
  }

  const handleSettleGames = async (gameIds: string[]) => {
    if (gameIds.length === 0) return
    const key = gameIds.join(',')
    if (processingIds.has(key)) return

    setProcessingIds((prev) => new Set(prev).add(key))
    try {
      const response = await fetch('/api/predictions/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_ids: gameIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '정산 처리에 실패했습니다.')
      toast({ title: '정산 완료', description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '오류',
        description: err instanceof Error ? err.message : '정산 처리 중 오류가 발생했습니다.',
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const filteredMatches = useMemo(() => {
    if (sportFilter === 'all') return matches
    return matches.filter((m) => m.sport === sportFilter)
  }, [matches, sportFilter])

  const sportOptions = useMemo(() => {
    const sports = [...new Set(matches.map((m) => m.sport))]
    return sports.sort()
  }, [matches])

  const roundGroups = useMemo(() => {
    const groups = new Map<string, UnsettledGame[]>()
    for (const m of filteredMatches) {
      const key = m.daily_round_id || 'no-round'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return groups
  }, [filteredMatches])

  const resultGames = useMemo(() => filteredMatches.filter((m) => m.has_result), [filteredMatches])
  const noResultGames = useMemo(() => filteredMatches.filter((m) => !m.has_result), [filteredMatches])

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
        <div className="flex flex-col items-center justify-center h-64 text-primary">
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
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 미정산</p>
              <p className="text-2xl font-bold">{matches.length}건</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Trophy className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">결과 있음 (정산 가능)</p>
              <p className="text-2xl font-bold">{resultGames.length}건</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">결과 미입력</p>
              <p className="text-2xl font-bold">{noResultGames.length}건</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 필터 + 일괄 정산 */}
      <Card>
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">정산 대기 목록</h2>
            <Badge variant="secondary">{filteredMatches.length}건</Badge>
          </div>
          <div className="flex items-center gap-2">
            {sportOptions.length > 1 && (
              <div className="flex items-center gap-1">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  <option value="all">전체 종목</option>
                  {sportOptions.map((s) => (
                    <option key={s} value={s}>
                      {sportLabels[s] || s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {resultGames.length > 0 && (
              <Button
                onClick={() => handleSettleGames(resultGames.map((g) => g.id))}
                size="sm"
                disabled={!!settlingRound || processingIds.size > 0}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                전체 일괄 정산 ({resultGames.length}건)
              </Button>
            )}
            <Button onClick={fetchUnsettledMatches} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> 새로고침
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">게임번호</TableHead>
                <TableHead>종목</TableHead>
                <TableHead>경기</TableHead>
                <TableHead>경기 시간</TableHead>
                <TableHead>스코어</TableHead>
                <TableHead>결과</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    정산 대기 중인 경기가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMatches.map((game) => {
                  const hasScore = game.home_score !== null && game.away_score !== null
                  const isProcessing = processingIds.has(game.id) || processingIds.has(`cancel-${game.id}`)
                  const statusInfo = statusLabels[game.status] || {
                    label: game.status,
                    variant: 'outline' as const,
                  }

                  return (
                    <TableRow key={game.id}>
                      <TableCell className="font-mono text-sm">
                        {game.game_no || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sportLabels[game.sport] || game.sport}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{game.home_team}</span>
                          <span className="text-muted-foreground mx-1">vs</span>
                          <span className="font-medium">{game.away_team}</span>
                        </div>
                        {game.game_type && (
                          <span className="text-xs text-muted-foreground">{game.game_type}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {game.match_time
                          ? format(new Date(game.match_time), 'MM/dd HH:mm', { locale: ko })
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {hasScore ? (
                          <span className="font-semibold tabular-nums">
                            {game.home_score} : {game.away_score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm flex items-center gap-1">
                            <Clock className="h-3 w-3" /> 미입력
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {game.result ? (
                          <Badge variant="secondary">{game.result}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResultDialog(game)}
                            disabled={isProcessing || !!settlingRound}
                            title="결과 수동 입력"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelGame(game)}
                            disabled={isProcessing || !!settlingRound}
                            title="경기 취소 (토큰 환불)"
                            className="text-destructive hover:text-destructive"
                          >
                            {processingIds.has(`cancel-${game.id}`) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {game.has_result && (
                            <Button
                              size="sm"
                              onClick={() => handleSettleGames([game.id])}
                              disabled={isProcessing || !!settlingRound}
                              title="정산 처리"
                            >
                              {processingIds.has(game.id) ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              )}
                              정산
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* 라운드별 그룹 정산 */}
      {[...roundGroups.entries()].filter(([key]) => key !== 'no-round').length > 0 && (
        <Card>
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">라운드별 일괄 정산</h2>
            <p className="text-sm text-muted-foreground">
              동일 라운드의 경기를 한 번에 정산합니다. 결과가 입력된 경기만 정산됩니다.
            </p>
          </div>
          <div className="p-4 space-y-3">
            {[...roundGroups.entries()]
              .filter(([key]) => key !== 'no-round')
              .map(([roundId, games]) => {
                const withResult = games.filter((g) => g.has_result).length
                const isSettling = settlingRound === roundId
                return (
                  <div
                    key={roundId}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium font-mono text-sm">
                        라운드: {roundId.slice(0, 12)}...
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {games.length}경기 중 {withResult}경기 결과 입력됨
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={withResult === 0 || isSettling || processingIds.size > 0}
                      onClick={() => handleSettleByRound(roundId)}
                    >
                      {isSettling ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" /> 처리 중
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> 라운드 정산 ({withResult}건)
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* 결과 수동 입력 다이얼로그 */}
      <Dialog open={!!editGame} onOpenChange={(open) => !open && closeResultDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>경기 결과 입력</DialogTitle>
          </DialogHeader>
          {editGame && (
            <div className="space-y-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-1">
                  <Badge variant="outline">{sportLabels[editGame.sport] || editGame.sport}</Badge>
                  <span>{editGame.game_type}</span>
                  <span>#{editGame.game_no}</span>
                </div>
                <div className="text-lg font-semibold">
                  {editGame.home_team} vs {editGame.away_team}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {editGame.match_time
                    ? format(new Date(editGame.match_time), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })
                    : ''}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">스코어</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">{editGame.home_team}</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={editHomeScore}
                      onChange={(e) => handleScoreChange('home', e.target.value)}
                      className="text-center text-lg font-bold tabular-nums"
                    />
                  </div>
                  <span className="text-xl font-bold text-muted-foreground mt-4">:</span>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">{editGame.away_team}</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={editAwayScore}
                      onChange={(e) => handleScoreChange('away', e.target.value)}
                      className="text-center text-lg font-bold tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">결과</label>
                <div className="grid grid-cols-3 gap-2">
                  {getResultOptions(editGame.game_type).map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={editResult === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditResult(opt.value)}
                      className="w-full"
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {editResult && editHomeScore !== '' && editAwayScore !== '' && (
                <div className="p-3 bg-green-500/10 rounded-lg text-sm text-center">
                  <span className="font-semibold">{editHomeScore} : {editAwayScore}</span>
                  {' → '}
                  <Badge variant="secondary">{editResult}</Badge>
                  <span className="text-muted-foreground ml-1">(저장 시 자동 정산)</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeResultDialog} disabled={isSaving}>
              취소
            </Button>
            <Button onClick={handleSaveResult} disabled={isSaving || !editResult || editHomeScore === '' || editAwayScore === ''}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
                </>
              ) : (
                '결과 저장 + 정산'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
