"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { type UnsettledGame, sportLabels, statusLabels } from "./settlement-types"
import { SettlementEditDialog } from "./settlement-edit-dialog"

export function SettlementManagementTable() {
  const [matches, setMatches] = useState<UnsettledGame[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [settlingRound, setSettlingRound] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState<string>("all")
  const [editGame, setEditGame] = useState<UnsettledGame | null>(null)

  const fetchUnsettledMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/predictions/settle?unsettled_only=true")
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "정산 대기 목록을 불러오는데 실패했습니다.")
      }
      const data = await response.json()
      setMatches(data.matches || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "정산 대기 목록을 불러오는데 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnsettledMatches()
  }, [fetchUnsettledMatches])

  const handleCancelGame = async (game: UnsettledGame) => {
    if (
      !confirm(
        `${game.home_team} vs ${game.away_team} 경기를 취소 처리하시겠습니까?\n예측한 유저에게 토큰이 환불됩니다.`
      )
    ) {
      return
    }

    setProcessingIds((prev) => new Set(prev).add(`cancel-${game.id}`))
    try {
      const response = await fetch("/api/admin/matches/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [{ game_id: game.id, home_score: 0, away_score: 0, result: "cancelled" }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "취소 처리에 실패했습니다.")

      toast({ title: "경기 취소 완료", description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "취소 처리 중 오류가 발생했습니다.",
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
    // 정산은 유저 잔액에 볼을 지급한다 — 되돌리는 UI 가 없다
    if (
      !window.confirm(`이 라운드를 정산합니다.

적중 유저에게 배당만큼 볼이 지급되며 되돌릴 수 없습니다. 계속할까요?`)
    )
      return
    setSettlingRound(dailyRoundId)
    try {
      const response = await fetch("/api/predictions/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_round_id: dailyRoundId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "정산 처리에 실패했습니다.")
      toast({ title: "정산 완료", description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "정산 처리 중 오류가 발생했습니다.",
      })
    } finally {
      setSettlingRound(null)
    }
  }

  const handleSettleGames = async (gameIds: string[]) => {
    if (gameIds.length === 0) return
    const key = gameIds.join(",")
    if (processingIds.has(key)) return

    // 여러 건을 한 번에 정산할 때만 확인을 받는다. 단건은 경기 행에서 결과를
    // 눈으로 보고 누르는 흐름이라 마찰을 더하지 않는다.
    if (
      gameIds.length > 1 &&
      !window.confirm(
        `${gameIds.length}건을 한 번에 정산합니다.

적중 유저에게 배당만큼 볼이 지급되며 되돌리는 화면이 없습니다.
결과가 맞는지 확인하셨습니까?`
      )
    )
      return

    setProcessingIds((prev) => new Set(prev).add(key))
    try {
      const response = await fetch("/api/predictions/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_ids: gameIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "정산 처리에 실패했습니다.")
      toast({ title: "정산 완료", description: data.message })
      await fetchUnsettledMatches()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "정산 처리 중 오류가 발생했습니다.",
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
    if (sportFilter === "all") return matches
    return matches.filter((m) => m.sport === sportFilter)
  }, [matches, sportFilter])

  const sportOptions = useMemo(() => {
    const sports = [...new Set(matches.map((m) => m.sport))]
    return sports.sort()
  }, [matches])

  const roundGroups = useMemo(() => {
    const groups = new Map<string, UnsettledGame[]>()
    for (const m of filteredMatches) {
      const key = m.daily_round_id || "no-round"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return groups
  }, [filteredMatches])

  const resultGames = useMemo(() => filteredMatches.filter((m) => m.has_result), [filteredMatches])
  const noResultGames = useMemo(
    () => filteredMatches.filter((m) => !m.has_result),
    [filteredMatches]
  )

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="text-primary flex h-64 flex-col items-center justify-center">
          <XCircle className="mb-2 h-10 w-10" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button onClick={fetchUnsettledMatches} className="mt-4" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">전체 미정산</p>
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
              <p className="text-muted-foreground text-sm">결과 있음 (정산 가능)</p>
              <p className="text-2xl font-bold">{resultGames.length}건</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted rounded-lg p-2">
              <Clock className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">결과 미입력</p>
              <p className="text-2xl font-bold">{noResultGames.length}건</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 필터 + 일괄 정산 */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">정산 대기 목록</h2>
            <Badge variant="secondary">{filteredMatches.length}건</Badge>
          </div>
          <div className="flex items-center gap-2">
            {sportOptions.length > 1 && (
              <div className="flex items-center gap-1">
                <Filter className="text-muted-foreground h-4 w-4" />
                <select
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                  className="bg-background rounded border px-2 py-1 text-sm"
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
                <CheckCircle2 className="mr-1 h-4 w-4" />
                전체 일괄 정산 ({resultGames.length}건)
              </Button>
            )}
            <Button onClick={fetchUnsettledMatches} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" /> 새로고침
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
                  <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                    정산 대기 중인 경기가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMatches.map((game) => {
                  const hasScore = game.home_score !== null && game.away_score !== null
                  const isProcessing =
                    processingIds.has(game.id) || processingIds.has(`cancel-${game.id}`)
                  const statusInfo = statusLabels[game.status] || {
                    label: game.status,
                    variant: "outline" as const,
                  }

                  return (
                    <TableRow key={game.id}>
                      <TableCell className="font-mono text-sm">{game.game_no || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{sportLabels[game.sport] || game.sport}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{game.home_team}</span>
                          <span className="text-muted-foreground mx-1">vs</span>
                          <span className="font-medium">{game.away_team}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                          {game.game_type && (
                            <span className="text-muted-foreground text-xs">{game.game_type}</span>
                          )}
                          {game.handicap !== null && (
                            <Badge variant="outline" className="h-4 px-1 py-0 text-[10px]">
                              H {game.handicap > 0 ? "+" : ""}
                              {game.handicap}
                            </Badge>
                          )}
                          {game.over_under_line !== null && (
                            <Badge variant="outline" className="h-4 px-1 py-0 text-[10px]">
                              L {game.over_under_line}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {game.match_time
                          ? format(new Date(game.match_time), "MM/dd HH:mm", { locale: ko })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {hasScore ? (
                          <span className="font-semibold tabular-nums">
                            {game.home_score} : {game.away_score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1 text-sm">
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
                            onClick={() => setEditGame(game)}
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
      {[...roundGroups.entries()].filter(([key]) => key !== "no-round").length > 0 && (
        <Card>
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">라운드별 일괄 정산</h2>
            <p className="text-muted-foreground text-sm">
              동일 라운드의 경기를 한 번에 정산합니다. 결과가 입력된 경기만 정산됩니다.
            </p>
          </div>
          <div className="space-y-3 p-4">
            {[...roundGroups.entries()]
              .filter(([key]) => key !== "no-round")
              .map(([roundId, games]) => {
                const withResult = games.filter((g) => g.has_result).length
                const isSettling = settlingRound === roundId
                return (
                  <div
                    key={roundId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-mono text-sm font-medium">
                        라운드: {roundId.slice(0, 12)}...
                      </p>
                      <p className="text-muted-foreground text-sm">
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
      <SettlementEditDialog
        game={editGame}
        onClose={() => setEditGame(null)}
        onSaved={fetchUnsettledMatches}
      />
    </div>
  )
}
