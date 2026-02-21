'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, Target, Trophy, Flag, Activity } from 'lucide-react'

interface KpiData {
  totalUsers: number
  totalPosts: number
  totalPredictions: number
  activeGames: number
  pendingReports: number
  systemHealthy: boolean
}

const kpiConfig = [
  { key: 'totalUsers' as const, label: '전체 사용자', icon: Users, color: 'text-blue-600' },
  { key: 'totalPosts' as const, label: '전체 게시글', icon: FileText, color: 'text-green-600' },
  { key: 'totalPredictions' as const, label: '전체 예측', icon: Target, color: 'text-purple-600' },
  { key: 'activeGames' as const, label: '진행 중 경기', icon: Trophy, color: 'text-orange-600' },
  { key: 'pendingReports' as const, label: '대기 중 신고', icon: Flag, color: 'text-red-600' },
]

export function DashboardKpiCards({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpiConfig.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-2xl font-bold">{data[kpi.key].toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            시스템 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${data.systemHealthy ? 'text-green-600' : 'text-red-600'}`} />
            <span className="text-2xl font-bold">{data.systemHealthy ? '정상' : '점검'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
