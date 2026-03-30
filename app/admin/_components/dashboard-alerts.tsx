"use client"

import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Flag, RefreshCw, AlertTriangle, Zap, CheckCircle2, ArrowRight } from "lucide-react"

interface AlertsData {
  alerts: {
    pendingReports: number
    betmanSyncStale: boolean
    betmanLastSync: string | null
    unsettledGames: number
    cronFailures: number
  }
}

export function DashboardAlerts() {
  const { data, isLoading } = useSWR<AlertsData>("/api/admin/operations/dashboard", fetcher, {
    refreshInterval: 60_000,
  })

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <RefreshCw className="text-muted-foreground h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  const { alerts } = data
  const hasIssues =
    alerts.pendingReports > 0 ||
    alerts.betmanSyncStale ||
    alerts.unsettledGames > 0 ||
    alerts.cronFailures > 0

  if (!hasIssues) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">모든 시스템 정상 운영 중</span>
        </CardContent>
      </Card>
    )
  }

  const alertItems = [
    alerts.pendingReports > 0 && {
      icon: Flag,
      color: "text-red-600",
      bgColor: "bg-red-50",
      title: `미처리 신고 ${alerts.pendingReports}건`,
      href: "/admin/content/reports",
      actionLabel: "신고 처리",
    },
    alerts.betmanSyncStale && {
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      title: "Betman 동기화 지연",
      href: "/admin/system",
      actionLabel: "상태 확인",
    },
    alerts.unsettledGames > 0 && {
      icon: Zap,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      title: `미정산 경기 ${alerts.unsettledGames}건`,
      href: "/admin/settlements",
      actionLabel: "정산 처리",
    },
    alerts.cronFailures > 0 && {
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      title: `크롤러 실패 ${alerts.cronFailures}건`,
      href: "/admin/system",
      actionLabel: "로그 확인",
    },
  ].filter(Boolean) as {
    icon: typeof Flag
    color: string
    bgColor: string
    title: string
    href: string
    actionLabel: string
  }[]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">주의 필요</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alertItems.map((alert) => {
          const Icon = alert.icon
          return (
            <div
              key={alert.title}
              className={`flex items-center justify-between rounded-lg px-4 py-3 ${alert.bgColor}`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 shrink-0 ${alert.color}`} />
                <span className="text-sm font-medium">{alert.title}</span>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={alert.href}>
                  {alert.actionLabel}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
