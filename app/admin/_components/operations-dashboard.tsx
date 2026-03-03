"use client"

import { useRef, useEffect } from "react"
import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/swr"
import { useBrowserNotifications } from "@/hooks/use-browser-notifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  RefreshCw,
  Users,
  FileText,
  Activity,
  Bot,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"

interface DashboardData {
  alerts: {
    pendingReports: number
    betmanSyncStale: boolean
    betmanLastSync: string | null
    unsettledGames: number
    cronFailures: number
  }
  daily: {
    newUsersToday: number
    newPostsToday: number
    activeUsersToday: number
    seedBotLastRun: string | null
  }
  weekly: {
    usersThisWeek: number
    usersPrevWeek: number
    abnormalTokenBalances: { user_id: string; display_name: string | null; token_balance: number }[]
  }
  fetchedAt: string
}

export function OperationsDashboard() {
  const { data, isLoading, mutate } = useSWR<DashboardData>(
    "/api/admin/operations/dashboard",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  )

  const { permission, requestPermission, notify } = useBrowserNotifications()
  const prevAlerts = useRef<DashboardData["alerts"] | null>(null)

  // 알림 발동: 새로운/악화된 항목만
  useEffect(() => {
    if (!data || permission !== "granted") return
    const prev = prevAlerts.current
    const curr = data.alerts

    if (prev) {
      if (curr.pendingReports > prev.pendingReports) {
        notify("미처리 신고 증가", { body: `${curr.pendingReports}건 대기 중` })
      }
      if (curr.betmanSyncStale && !prev.betmanSyncStale) {
        notify("Betman 동기화 지연", { body: "3시간 이상 미동기화" })
      }
      if (curr.unsettledGames > prev.unsettledGames) {
        notify("미정산 경기 증가", { body: `${curr.unsettledGames}건` })
      }
      if (curr.cronFailures > prev.cronFailures) {
        notify("크론 실패 감지", { body: `오늘 ${curr.cronFailures}건 실패` })
      }
    }

    prevAlerts.current = curr
  }, [data, permission, notify])

  if (isLoading || !data) {
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

  const { alerts, daily, weekly, fetchedAt } = data

  const hasAlerts =
    alerts.pendingReports > 0 ||
    alerts.betmanSyncStale ||
    alerts.unsettledGames > 0 ||
    alerts.cronFailures > 0

  const growthRate =
    weekly.usersPrevWeek > 0
      ? ((weekly.usersThisWeek - weekly.usersPrevWeek) / weekly.usersPrevWeek) * 100
      : weekly.usersThisWeek > 0
        ? 100
        : 0

  return (
    <main className="space-y-8 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">운영 모니터링</h1>
          <p className="text-muted-foreground text-sm">
            마지막 갱신: {new Date(fetchedAt).toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={requestPermission}
            disabled={permission === "granted"}
          >
            {permission === "granted" ? (
              <>
                <Bell className="mr-1 h-4 w-4" />
                알림 활성
              </>
            ) : (
              <>
                <BellOff className="mr-1 h-4 w-4" />
                알림 허용
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 긴급 알림 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">긴급 알림</h2>
        {!hasAlerts ? (
          <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700 dark:text-green-400">이상 없음</AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-500">
              모든 시스템이 정상 운영 중입니다.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {alerts.pendingReports > 0 && (
              <AlertCard
                severity="red"
                title={`미처리 신고 ${alerts.pendingReports}건`}
                description="대기 중인 신고를 확인하세요."
                href="/admin/content/reports"
              />
            )}
            {alerts.betmanSyncStale && (
              <AlertCard
                severity="red"
                title="Betman 동기화 지연"
                description={
                  alerts.betmanLastSync
                    ? `마지막 동기화: ${new Date(alerts.betmanLastSync).toLocaleString("ko-KR")}`
                    : "동기화 기록 없음"
                }
                href="/admin/system"
              />
            )}
            {alerts.unsettledGames > 0 && (
              <AlertCard
                severity="yellow"
                title={`미정산 경기 ${alerts.unsettledGames}건`}
                description="경기 종료 후 결과가 미입력된 경기가 있습니다."
                href="/admin/settlements"
              />
            )}
            {alerts.cronFailures > 0 && (
              <AlertCard
                severity="yellow"
                title={`크론 실패 ${alerts.cronFailures}건 (오늘)`}
                description="크롤러 실행 중 오류가 발생했습니다."
                href="/admin/system"
              />
            )}
          </div>
        )}
      </section>

      {/* 일일 현황 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">일일 현황</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="신규 유저"
            value={daily.newUsersToday}
            icon={Users}
            color="text-blue-600"
          />
          <StatCard
            label="새 글"
            value={daily.newPostsToday}
            icon={FileText}
            color="text-green-600"
          />
          <StatCard
            label="활성 유저"
            value={daily.activeUsersToday}
            icon={Activity}
            color="text-purple-600"
          />
          <StatCard
            label="시드봇 마지막 실행"
            value={
              daily.seedBotLastRun
                ? new Date(daily.seedBotLastRun).toLocaleString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "기록 없음"
            }
            icon={Bot}
            color="text-orange-600"
          />
        </div>
      </section>

      {/* 주간 리뷰 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">주간 리뷰</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* 유저 성장률 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                유저 성장률
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold">{weekly.usersThisWeek}</span>
                <span className="text-muted-foreground text-sm">이번 주</span>
                <span className="text-muted-foreground text-sm">vs</span>
                <span className="text-lg">{weekly.usersPrevWeek}</span>
                <span className="text-muted-foreground text-sm">지난 주</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {growthRate > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : growthRate < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                ) : (
                  <Minus className="text-muted-foreground h-4 w-4" />
                )}
                <span
                  className={
                    growthRate > 0
                      ? "text-sm font-medium text-green-600"
                      : growthRate < 0
                        ? "text-sm font-medium text-red-600"
                        : "text-muted-foreground text-sm"
                  }
                >
                  {growthRate > 0 ? "+" : ""}
                  {growthRate.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 비정상 토큰 잔액 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                비정상 토큰 잔액 (&gt;50볼)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekly.abnormalTokenBalances.length === 0 ? (
                <p className="text-muted-foreground text-sm">해당 없음</p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="py-1 text-left">유저</th>
                        <th className="py-1 text-right">잔액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekly.abnormalTokenBalances.map((u) => (
                        <tr key={u.user_id} className="border-b last:border-0">
                          <td className="max-w-[150px] truncate py-1">
                            {u.display_name || u.user_id.slice(0, 12)}
                          </td>
                          <td className="py-1 text-right font-mono">
                            {u.token_balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}

function AlertCard({
  severity,
  title,
  description,
  href,
}: {
  severity: "red" | "yellow"
  title: string
  description: string
  href: string
}) {
  const isRed = severity === "red"
  return (
    <Alert
      variant={isRed ? "destructive" : "default"}
      className={
        isRed
          ? "border-red-500/50 bg-red-50 dark:bg-red-950/20"
          : "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
      }
    >
      <AlertTriangle className={`h-4 w-4 ${isRed ? "text-red-600" : "text-yellow-600"}`} />
      <AlertTitle
        className={
          isRed ? "text-red-700 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"
        }
      >
        {title}
      </AlertTitle>
      <AlertDescription>
        <span
          className={
            isRed ? "text-red-600 dark:text-red-500" : "text-yellow-600 dark:text-yellow-500"
          }
        >
          {description}
        </span>
        <Link href={href} className="ml-2 text-sm font-medium underline hover:opacity-80">
          확인하기 →
        </Link>
      </AlertDescription>
    </Alert>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-2xl font-bold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
