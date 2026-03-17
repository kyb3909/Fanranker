"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Target, Percent, Banknote, RefreshCw, Loader2 } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

interface DailyPoint {
  date: string
  wagered: number
  payout: number
  housePnl: number
  avgProfitRate: number | null
  avgAccuracy: number | null
}

interface SportStat {
  sport: string
  avgProfitRate: number | null
  avgAccuracy: number | null
  housePnl: number
  totalWagered: number
  totalReturns: number
  correctPredictions: number
  wrongPredictions: number
}

interface OverallStat {
  avgProfitRate: number | null
  avgAccuracy: number | null
  housePnl: number
  totalWagered: number
  totalReturns: number
  correctPredictions: number
  wrongPredictions: number
}

interface StatsData {
  overall: OverallStat
  bySport: SportStat[]
  dailyTrend: DailyPoint[]
  fetchedAt: string
}

function formatPct(n: number | null): string {
  if (n === null) return "-"
  return `${n >= 0 ? "+" : ""}${n}%`
}

function formatPnl(n: number): string {
  const s = n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
  return `${s}볼`
}

export default function AdminStatsPage() {
  const { data, isLoading, mutate } = useSWR<StatsData>("/api/admin/stats", fetcher, {
    refreshInterval: 60_000,
  })

  if (isLoading || !data) {
    return (
      <main className="flex min-h-[200px] items-center justify-center p-6">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </main>
    )
  }

  const { overall, bySport, dailyTrend } = data

  const chartData = dailyTrend.map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date + "T12:00:00"), "M/d (E)", { locale: ko }).replace(".", ""),
    수익률: d.avgProfitRate ?? 0,
    적중률: d.avgAccuracy ?? 0,
    주인장손익: d.housePnl,
  }))

  return (
    <main className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">승부예측 통계</h1>
          <p className="text-muted-foreground text-sm">
            전체 유저 수익률·적중률, 주인장 손익, 종목별·일자별 추이
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>

      {/* 전체 요약 카드 */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Percent className="h-4 w-4" />
              통합 평균 수익률
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                (overall.avgProfitRate ?? 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPct(overall.avgProfitRate)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              배팅금 {overall.totalWagered?.toLocaleString() ?? 0}볼 · 회수{" "}
              {overall.totalReturns?.toLocaleString() ?? 0}볼
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4" />
              통합 평균 적중률
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatPct(overall.avgAccuracy)}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              적중 {overall.correctPredictions?.toLocaleString() ?? 0} / 오답{" "}
              {overall.wrongPredictions?.toLocaleString() ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4" />
              주인장 손익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                overall.housePnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPnl(overall.housePnl)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {overall.housePnl >= 0 ? "주인장 흑자" : "주인장 적자"}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* 일주일 추이 라인 그래프 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 7일 추이</CardTitle>
          <p className="text-muted-foreground text-sm">일자별 수익률·적중률·주인장 손익</p>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : 0
                    if (name === "수익률" || name === "적중률")
                      return [formatPct(v), name as string]
                    return [v.toLocaleString() + "볼", name as string]
                  }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <ReferenceLine
                  yAxisId="left"
                  y={0}
                  stroke="hsl(var(--border))"
                  strokeDasharray="2 2"
                />
                <ReferenceLine
                  yAxisId="right"
                  y={0}
                  stroke="hsl(var(--border))"
                  strokeDasharray="2 2"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="수익률"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="수익률 (%)"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="적중률"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="적중률 (%)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="주인장손익"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="주인장 손익 (볼)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 종목별 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">종목별 통계</CardTitle>
          <p className="text-muted-foreground text-sm">수익률·적중률·주인장 손익</p>
        </CardHeader>
        <CardContent>
          {bySport.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">데이터 없음</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead className="text-right">평균 수익률</TableHead>
                  <TableHead className="text-right">평균 적중률</TableHead>
                  <TableHead className="text-right">주인장 손익</TableHead>
                  <TableHead className="text-right">배팅금</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySport.map((row) => (
                  <TableRow key={row.sport}>
                    <TableCell>
                      <Badge variant="secondary">{row.sport}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          (row.avgProfitRate ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {formatPct(row.avgProfitRate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatPct(row.avgAccuracy)}</TableCell>
                    <TableCell className="text-right">
                      <span className={row.housePnl >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatPnl(row.housePnl)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right">
                      {row.totalWagered?.toLocaleString() ?? 0}볼
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
