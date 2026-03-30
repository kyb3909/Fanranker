"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  FileText,
  Target,
  Trophy,
  Flag,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { changePercent } from "@/lib/utils/math"

interface TrendData {
  usersToday: number
  usersYesterday: number
  postsToday: number
  postsYesterday: number
  predictionsToday: number
  predictionsYesterday: number
}

interface KpiData {
  totalUsers: number
  totalPosts: number
  totalPredictions: number
  activeGames: number
  pendingReports: number
  systemHealthy: boolean
  trends?: TrendData
}

const kpiConfig = [
  {
    key: "totalUsers" as const,
    label: "전체 사용자",
    icon: Users,
    color: "text-blue-600",
    href: "/admin/users",
    trendToday: "usersToday" as const,
    trendYesterday: "usersYesterday" as const,
  },
  {
    key: "totalPosts" as const,
    label: "전체 게시글",
    icon: FileText,
    color: "text-green-600",
    href: "/admin/content/posts",
    trendToday: "postsToday" as const,
    trendYesterday: "postsYesterday" as const,
  },
  {
    key: "totalPredictions" as const,
    label: "전체 예측",
    icon: Target,
    color: "text-purple-600",
    href: "/admin/matches",
    trendToday: "predictionsToday" as const,
    trendYesterday: "predictionsYesterday" as const,
  },
  {
    key: "activeGames" as const,
    label: "진행 중 경기",
    icon: Trophy,
    color: "text-orange-600",
    href: "/admin/matches",
  },
  {
    key: "pendingReports" as const,
    label: "대기 중 신고",
    icon: Flag,
    color: "text-primary",
    href: "/admin/content/reports",
  },
]

function TrendIndicator({ today, yesterday }: { today: number; yesterday: number }) {
  const delta = changePercent(today, yesterday)
  if (today === 0 && yesterday === 0) return null

  const isUp = delta > 0
  const isDown = delta < 0
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  const colorClass = isUp ? "text-green-600" : isDown ? "text-red-500" : "text-muted-foreground"

  return (
    <div className={`mt-1 flex items-center gap-1 ${colorClass}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-medium">
        {isUp ? "+" : ""}
        {delta.toFixed(1)}% vs 어제
      </span>
    </div>
  )
}

export function DashboardKpiCards({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {kpiConfig.map((kpi) => {
        const Icon = kpi.icon
        const trendToday = kpi.trendToday && data.trends ? data.trends[kpi.trendToday] : undefined
        const trendYesterday =
          kpi.trendYesterday && data.trends ? data.trends[kpi.trendYesterday] : undefined

        return (
          <Link key={kpi.key} href={kpi.href}>
            <Card className="hover:border-primary/50 h-full cursor-pointer transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-xs font-medium">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-2xl font-bold" suppressHydrationWarning>
                    {data[kpi.key].toLocaleString()}
                  </span>
                </div>
                {trendToday !== undefined && trendYesterday !== undefined && (
                  <TrendIndicator today={trendToday} yesterday={trendYesterday} />
                )}
              </CardContent>
            </Card>
          </Link>
        )
      })}
      <Link href="/admin/system">
        <Card className="hover:border-primary/50 h-full cursor-pointer transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium">시스템 상태</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity
                className={`h-4 w-4 ${data.systemHealthy ? "text-green-600" : "text-primary"}`}
              />
              <span className="text-2xl font-bold">{data.systemHealthy ? "정상" : "점검"}</span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
