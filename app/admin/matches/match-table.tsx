"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, XCircle, RefreshCw, Clock, ChevronLeft, ChevronRight, Pencil } from "lucide-react"
import { format } from "date-fns"
import {
  MatchResultEditorDialog,
  type EditableMatchResultGame,
} from "../_components/match-result-editor-dialog"

interface GameMatch extends EditableMatchResultGame {
  status: string | null
  prediction_count: number
}

const SPORT_LABELS: Record<string, string> = {
  축구: "축구",
  야구: "야구",
  농구: "농구",
  배구: "배구",
  soccer: "축구",
  baseball: "야구",
  basketball: "농구",
  volleyball: "배구",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  finished: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

const RESULT_LABELS: Record<string, string> = {
  home: "홈승",
  away: "원정승",
  draw: "무승부",
  over: "오버",
  under: "언더",
  odd: "홀",
  even: "짝",
  cancelled: "취소",
}

export function MatchManagementTable() {
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [sportFilter, setSportFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [editGame, setEditGame] = useState<GameMatch | null>(null)

  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        status: statusFilter,
        sport: sportFilter,
      })
      const response = await fetch(`/api/admin/matches/list?${params}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "경기 목록을 불러오는데 실패했습니다.")
      }
      const data = await response.json()
      setMatches(data.matches || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "경기 목록을 불러오는데 실패했습니다.")
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
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  if (error && matches.length === 0) {
    return (
      <Card>
        <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
          <XCircle className="text-destructive mb-2 h-10 w-10" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchMatches} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">경기 관리 (Betman)</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{total.toLocaleString()}개</Badge>
            <Button variant="outline" size="sm" onClick={fetchMatches} disabled={isLoading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> 새로고침
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="팀명 또는 경기번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-[130px]">
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
          <Select
            value={sportFilter}
            onValueChange={(v) => {
              setSportFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-[130px]">
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
              <TableHead className="w-[80px] text-right">수정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-muted-foreground h-24 text-center">
                  {search ? "검색 결과가 없습니다." : "경기가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              filteredMatches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell className="font-mono text-xs">{match.game_no}</TableCell>
                  <TableCell className="text-sm">
                    {SPORT_LABELS[match.sport] || match.sport}
                  </TableCell>
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
                        <Clock className="text-muted-foreground h-3 w-3" />
                        {format(new Date(match.match_time), "MM/dd HH:mm")}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {match.home_score !== null && match.away_score !== null
                      ? `${match.home_score} : ${match.away_score}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {match.result ? (
                      <Badge variant="secondary" className="text-xs">
                        {RESULT_LABELS[match.result] || match.result}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {match.game_type === "핸디캡" && match.handicap !== null && (
                      <Badge variant="outline" className="text-xs">
                        H {match.handicap > 0 ? "+" : ""}
                        {match.handicap}
                      </Badge>
                    )}
                    {(match.game_type === "언더오버" || match.game_type === "SUM") &&
                      match.over_under_line !== null && (
                        <Badge variant="outline" className="text-xs">
                          L {match.over_under_line}
                        </Badge>
                      )}
                  </TableCell>
                  <TableCell className="text-right">
                    {match.prediction_count > 0 ? (
                      <Badge variant="default" className="text-xs">
                        {match.prediction_count}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLORS[match.status || ""] || ""}`}
                    >
                      {match.status === "active"
                        ? "진행"
                        : match.status === "finished"
                          ? "종료"
                          : match.status === "cancelled"
                            ? "취소"
                            : match.status || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditGame(match)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      수정
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t p-4">
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()}개 중 {(page - 1) * 50 + 1}-{Math.min(page * 50, total)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {totalPages <= 1 && (
        <div className="text-muted-foreground border-t p-4 text-sm">
          총 {total.toLocaleString()}개의 경기
        </div>
      )}

      <MatchResultEditorDialog
        game={editGame}
        open={!!editGame}
        onOpenChange={(open) => {
          if (!open) setEditGame(null)
        }}
        onSaved={fetchMatches}
      />
    </Card>
  )
}
