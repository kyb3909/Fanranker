"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart3,
  Calendar,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"

interface ReportListItem {
  id: string
  period_start: string
  period_end: string
  summary: string | null
  generated_by: string
  generated_at: string
}

interface ComparisonMetric {
  current: number
  previous: number
  changePercent: number
}

interface ReportData {
  users: { dauAvg: number; wau: number; newUsers: number; returningUsers: number }
  engagement: {
    sessions: number
    avgEngagementTimeSec: number
    pagesPerSession: number
    bounceRate: number
  }
  topPages: { pagePath: string; screenPageViews: number }[]
  trafficSources: { channel: string; sessions: number }[]
  retention: { newUserRatio: number; returningUserRatio: number }
  comparison: {
    users: ComparisonMetric
    sessions: ComparisonMetric
    newUsers: ComparisonMetric
    avgEngagementTimeSec: ComparisonMetric
  }
  business?: {
    predictionUsers: number
    predictionSlips: number
    predictionParticipationRate: number
    purchaseUsers: number
    purchaseCount: number
    prevPredictionUsers: number
    prevPurchaseCount: number
    predictionUsersChangePercent: number
    purchaseCountChangePercent: number
  }
}

interface ReportDetail {
  id: string
  period_start: string
  period_end: string
  report_data: ReportData
  summary: string | null
  generated_by: string
  generated_at: string
  generation_duration_ms: number | null
}

export function AnalyticsDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genStart, setGenStart] = useState("")
  const [genEnd, setGenEnd] = useState("")
  const [showGenForm, setShowGenForm] = useState(false)

  const {
    data: listData,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<{ reports: ReportListItem[] }>("/api/admin/analytics/reports", fetcher)

  const { data: detailData, isLoading: detailLoading } = useSWR<{ report: ReportDetail }>(
    selectedId ? `/api/admin/analytics/reports/${selectedId}` : null,
    fetcher
  )

  const reports = listData?.reports ?? []
  const detail = detailData?.report ?? null

  async function handleGenerate() {
    if (!genStart || !genEnd) return
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/analytics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart: genStart, periodEnd: genEnd }),
      })
      const data = await res.json()
      if (data.success) {
        await mutateList()
        setSelectedId(data.reportId)
        setShowGenForm(false)
        setGenStart("")
        setGenEnd("")
      } else {
        alert(data.error || "리포트 생성 실패")
      }
    } catch {
      alert("리포트 생성 중 오류 발생")
    } finally {
      setGenerating(false)
    }
  }

  if (listLoading) {
    return (
      <main className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-8 w-48 rounded" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-muted h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-8 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">GA4 분석 리포트</h1>
          <p className="text-muted-foreground text-sm">
            주간 사이트 분석 데이터를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutateList()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
          <Button size="sm" onClick={() => setShowGenForm(!showGenForm)}>
            <Plus className="mr-1 h-4 w-4" />
            리포트 생성
          </Button>
        </div>
      </div>

      {/* 수동 리포트 생성 폼 */}
      {showGenForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">수동 리포트 생성</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">시작일</label>
                <input
                  type="date"
                  value={genStart}
                  onChange={(e) => setGenStart(e.target.value)}
                  className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">종료일</label>
                <input
                  type="date"
                  value={genEnd}
                  onChange={(e) => setGenEnd(e.target.value)}
                  className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
              <Button size="sm" onClick={handleGenerate} disabled={generating || !genStart || !genEnd}>
                {generating ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  "생성"
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowGenForm(false)}>
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 리포트 목록 */}
      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <h3 className="text-lg font-semibold">아직 리포트가 없습니다</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              위의 &quot;리포트 생성&quot; 버튼으로 첫 리포트를 만들어 보세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">리포트 목록</h2>
          <div className="grid gap-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                  selectedId === r.id ? "border-primary bg-muted/30" : "border-border"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">
                      {r.period_start} ~ {r.period_end}
                    </span>
                    <Badge variant={r.generated_by === "cron" ? "secondary" : "outline"}>
                      {r.generated_by === "cron" ? "자동" : "수동"}
                    </Badge>
                  </div>
                  {r.summary && (
                    <p className="text-muted-foreground mt-1 truncate text-xs">{r.summary}</p>
                  )}
                </div>
                <span className="text-muted-foreground ml-4 shrink-0 text-xs">
                  {new Date(r.generated_at).toLocaleDateString("ko-KR")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 리포트 상세 */}
      {selectedId && (
        <section className="space-y-6">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : (
            <ReportDetailView report={detail} />
          )}
        </section>
      )}
    </main>
  )
}

function ReportDetailView({ report }: { report: ReportDetail }) {
  const d = report.report_data

  return (
    <div className="space-y-6">
      {/* 요약 */}
      {report.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">요약</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">{report.summary}</p>
            {report.generation_duration_ms && (
              <p className="text-muted-foreground mt-2 text-xs">
                생성 소요: {(report.generation_duration_ms / 1000).toFixed(1)}초
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="DAU 평균"
          value={d.users.dauAvg}
          icon={Users}
          change={d.comparison.users.changePercent}
        />
        <KpiCard
          label="WAU"
          value={d.users.wau}
          icon={Users}
          change={d.comparison.users.changePercent}
        />
        <KpiCard
          label="신규 유저"
          value={d.users.newUsers}
          icon={TrendingUp}
          change={d.comparison.newUsers.changePercent}
        />
        <KpiCard
          label="세션 수"
          value={d.engagement.sessions}
          icon={BarChart3}
          change={d.comparison.sessions.changePercent}
        />
      </div>

      {/* 비즈니스 지표 */}
      {d.business && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">비즈니스 핵심 지표</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">승부예측 참여자</p>
                <p className="text-lg font-bold">{d.business.predictionUsers.toLocaleString()}명</p>
                <ChangeText value={d.business.predictionUsersChangePercent} />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">예측 참여율 (DAU 대비)</p>
                <p className="text-lg font-bold">{d.business.predictionParticipationRate}%</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  총 {d.business.predictionSlips.toLocaleString()}건
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">예측 정보 구매</p>
                <p className="text-lg font-bold">{d.business.purchaseCount.toLocaleString()}건</p>
                <ChangeText value={d.business.purchaseCountChangePercent} />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">구매 유저 수</p>
                <p className="text-lg font-bold">{d.business.purchaseUsers.toLocaleString()}명</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 참여도 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">참여도</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-muted-foreground text-xs">평균 체류시간</p>
              <p className="text-lg font-bold">
                {Math.floor(d.engagement.avgEngagementTimeSec / 60)}분{" "}
                {d.engagement.avgEngagementTimeSec % 60}초
              </p>
              <ChangeText value={d.comparison.avgEngagementTimeSec.changePercent} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">페이지/세션</p>
              <p className="text-lg font-bold">{d.engagement.pagesPerSession}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">이탈률</p>
              <p className="text-lg font-bold">{d.engagement.bounceRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 인기 페이지 + 트래픽 소스 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 인기 페이지 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              인기 페이지 Top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.topPages.length === 0 ? (
              <p className="text-muted-foreground text-sm">데이터 없음</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>페이지</TableHead>
                    <TableHead className="text-right">조회수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.topPages.map((page, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {page.pagePath}
                      </TableCell>
                      <TableCell className="text-right">
                        {page.screenPageViews.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 트래픽 소스 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4" />
              트래픽 소스 Top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.trafficSources.length === 0 ? (
              <p className="text-muted-foreground text-sm">데이터 없음</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>채널</TableHead>
                    <TableHead className="text-right">세션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.trafficSources.map((src, i) => (
                    <TableRow key={i}>
                      <TableCell>{src.channel}</TableCell>
                      <TableCell className="text-right">
                        {src.sessions.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 리텐션 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">신규 vs 재방문</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>신규 유저</span>
                <span className="font-medium">{d.retention.newUserRatio}%</span>
              </div>
              <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${d.retention.newUserRatio}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>재방문 유저</span>
                <span className="font-medium">{d.retention.returningUserRatio}%</span>
              </div>
              <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${d.retention.returningUserRatio}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  change,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  change: number
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Icon className="text-primary h-4 w-4" />
          <span className="text-2xl font-bold">{value.toLocaleString()}</span>
        </div>
        <ChangeText value={change} />
      </CardContent>
    </Card>
  )
}

function ChangeText({ value }: { value: number }) {
  if (value === 0) {
    return <p className="text-muted-foreground mt-1 text-xs">전주 대비 변동 없음</p>
  }

  const isUp = value > 0
  return (
    <p className={`mt-1 flex items-center gap-0.5 text-xs ${isUp ? "text-green-600" : "text-primary"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}
      {value}% 전주 대비
    </p>
  )
}
