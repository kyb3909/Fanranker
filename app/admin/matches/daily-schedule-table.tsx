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
import { Button } from "@/components/ui/button"
import { Loader2, XCircle, RefreshCw, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { format } from "date-fns"

const SPORT_LABELS: Record<string, string> = {
  축구: "축구",
  야구: "야구",
  농구: "농구",
  배구: "배구",
}

const PHASE_COLORS: Record<string, string> = {
  진행전: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  진행중: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  경기후: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  결과입력됨: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
}

interface ScheduleGame {
  id: string
  game_no: number
  sport: string
  game_type: string
  home_team: string
  away_team: string
  match_time: string
  status: string | null
  result: string | null
  result_label: string | null
  home_score: number | null
  away_score: number | null
  handicap: number | null
  over_under_line: number | null
  phase: "진행전" | "진행중" | "경기후" | "결과입력됨"
  prediction_count: number
}

interface ScheduleResponse {
  dailyId: string
  label: string
  windowStart: string
  windowEnd: string
  games: ScheduleGame[]
  total: number
}

export function DailyScheduleTable() {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [data, setData] = useState<ScheduleResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/matches/schedule?date=${date}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "일정표를 불러오는데 실패했습니다.")
      }
      const json: ScheduleResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "일정표를 불러오는데 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  const goPrevDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    setDate(format(d, "yyyy-MM-dd"))
  }

  const goNextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    setDate(format(d, "yyyy-MM-dd"))
  }

  const isToday = date === format(new Date(), "yyyy-MM-dd")

  if (isLoading && !data) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  if (error && !data) {
    return (
      <Card>
        <div className="flex h-48 flex-col items-center justify-center p-6 text-center">
          <XCircle className="text-destructive mb-2 h-10 w-10" />
          <p className="text-lg font-medium">일정표를 불러오는데 실패했습니다.</p>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
          <Button variant="outline" onClick={fetchSchedule} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
          </Button>
        </div>
      </Card>
    )
  }

  const games = data?.games ?? []

  return (
    <Card>
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">일정표 (23시 리셋 기준)</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevDay} aria-label="전날">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <label className="sr-only" htmlFor="schedule-date">
              날짜 선택
            </label>
            <input
              id="schedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            />
            <Button variant="outline" size="sm" onClick={goNextDay} aria-label="다음날">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDate(format(new Date(), "yyyy-MM-dd"))}
              >
                오늘
              </Button>
            )}
            <Badge variant="secondary">{data?.label ?? date}</Badge>
            <Button variant="outline" size="sm" onClick={fetchSchedule} disabled={isLoading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> 새로고침
            </Button>
          </div>
        </div>
        {data && (
          <p className="text-muted-foreground text-xs">
            {data.dailyId} 회차 · 08:00 KST ~ 익일 08:00 KST · 총 {data.total}경기
          </p>
        )}
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
              <TableHead className="w-[100px]">단계</TableHead>
              <TableHead className="w-[80px] text-center">스코어</TableHead>
              <TableHead className="w-[90px]">적중 결과</TableHead>
              <TableHead className="w-[70px] text-right">예측 수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                  이 날짜에 등록된 경기가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              games.map((match) => (
                <TableRow key={match.id}>
                  <TableCell className="font-mono text-xs">{match.game_no}</TableCell>
                  <TableCell className="text-sm">
                    {SPORT_LABELS[match.sport] ?? match.sport}
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
                    <span className="flex items-center gap-1 text-xs">
                      <Clock className="text-muted-foreground h-3 w-3" />
                      {format(new Date(match.match_time), "MM/dd HH:mm")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${PHASE_COLORS[match.phase] ?? ""}`}
                    >
                      {match.phase}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {match.home_score !== null && match.away_score !== null
                      ? `${match.home_score} : ${match.away_score}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {match.result_label ? (
                      <Badge variant="secondary" className="text-xs">
                        {match.result_label}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
