"use client"

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useBrowserNotifications } from "@/hooks/use-browser-notifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  AlertOctagon,
  Database,
  Shuffle,
  Clock,
} from "lucide-react"

interface IntegrityIssue {
  type: "missing" | "mismatch" | "status"
  severity: "error" | "warning"
  gameId: string
  gameNo: number
  roundGmTs: string
  teams: string
  matchTime: string
  message: string
  details?: string
}

interface IntegrityData {
  issues: IntegrityIssue[]
  summary: {
    total: number
    error: number
    warning: number
    byType: {
      missing: number
      mismatch: number
      status: number
    }
  }
  checkedAt: string
}

const TYPE_CONFIG = {
  missing: { label: "누락", icon: Database, color: "text-orange-600" },
  mismatch: { label: "불일치", icon: Shuffle, color: "text-red-600" },
  status: { label: "상태 이상", icon: Clock, color: "text-yellow-600" },
} as const

export function DataIntegrityAlerts() {
  const { data, isLoading, mutate } = useSWR<IntegrityData>("/api/admin/data-integrity", fetcher, {
    refreshInterval: 120_000,
    revalidateOnFocus: true,
  })

  const { permission, notify } = useBrowserNotifications()
  const prevErrorCount = useRef<number>(0)

  // 에러 증가 시 브라우저 알림
  useEffect(() => {
    if (!data || permission !== "granted") return
    const errorCount = data.summary.error
    if (prevErrorCount.current > 0 && errorCount > prevErrorCount.current) {
      notify("데이터 정합성 이상 감지", {
        body: `에러 ${errorCount}건 (${errorCount - prevErrorCount.current}건 증가)`,
      })
    }
    prevErrorCount.current = errorCount
  }, [data, permission, notify])

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">데이터 정합성 검사</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="bg-muted h-6 w-32 rounded" />
            <div className="bg-muted h-20 rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const { issues, summary, checkedAt } = data
  const hasIssues = summary.total > 0

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">데이터 정합성 검사</h2>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {new Date(checkedAt).toLocaleString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="전체 이슈"
          value={summary.total}
          color={summary.total === 0 ? "text-green-600" : "text-foreground"}
          icon={summary.total === 0 ? CheckCircle2 : AlertTriangle}
        />
        <SummaryCard
          label="에러"
          value={summary.error}
          color={summary.error > 0 ? "text-red-600" : "text-muted-foreground"}
          icon={XCircle}
        />
        <SummaryCard
          label="누락"
          value={summary.byType.missing}
          color={summary.byType.missing > 0 ? "text-orange-600" : "text-muted-foreground"}
          icon={Database}
        />
        <SummaryCard
          label="불일치"
          value={summary.byType.mismatch}
          color={summary.byType.mismatch > 0 ? "text-red-600" : "text-muted-foreground"}
          icon={Shuffle}
        />
      </div>

      {/* 이슈 목록 */}
      {!hasIssues ? (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">정합성 이상 없음</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            최근 7일 경기 데이터에 이상이 없습니다.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="max-h-[400px] overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-muted-foreground border-b text-left">
                  <th className="px-3 py-2 font-medium">구분</th>
                  <th className="px-3 py-2 font-medium">경기</th>
                  <th className="px-3 py-2 font-medium">회차</th>
                  <th className="px-3 py-2 font-medium">내용</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue, i) => {
                  const cfg = TYPE_CONFIG[issue.type]
                  const Icon = issue.severity === "error" ? AlertOctagon : cfg.icon
                  return (
                    <tr
                      key={`${issue.gameId}-${issue.type}-${i}`}
                      className={`border-b last:border-0 ${
                        issue.severity === "error" ? "bg-red-50/50 dark:bg-red-950/10" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            className={`h-3.5 w-3.5 ${
                              issue.severity === "error" ? "text-red-600" : cfg.color
                            }`}
                          />
                          <Badge
                            variant={issue.severity === "error" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {cfg.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 font-medium">
                        {issue.teams}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                        R{issue.roundGmTs}#{issue.gameNo}
                      </td>
                      <td className="px-3 py-2">
                        <span>{issue.message}</span>
                        {issue.details && (
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({issue.details})
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function SummaryCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-2 p-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <div>
          <p className="text-muted-foreground text-[10px]">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
