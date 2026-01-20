import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, Trophy, Coins, Target, TrendingUp, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  try {
    await requireAdmin()
  } catch (error) {
    redirect('/')
  }

  const adminMenus = [
    {
      title: '경기 관리',
      description: '경기 목록 조회 및 수정',
      href: '/admin/matches',
      icon: Trophy,
      color: 'text-blue-600',
    },
    {
      title: '전문가 승인',
      description: '전문가 인증 승인/해제',
      href: '/admin/experts',
      icon: Shield,
      color: 'text-purple-600',
    },
    {
      title: '정산 처리',
      description: '예측 결과 정산 수동 처리',
      href: '/admin/settlements',
      icon: Coins,
      color: 'text-green-600',
    },
    {
      title: '토큰 모니터링',
      description: '사이버 토큰 시스템 모니터링',
      href: '/admin/tokens',
      icon: Target,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">관리자 대시보드</h1>
        <p className="text-muted-foreground">시스템 관리 및 모니터링</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {adminMenus.map((menu) => {
          const Icon = menu.icon
          return (
            <Link key={menu.href} href={menu.href}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Icon className={`h-6 w-6 ${menu.color}`} />
                    <CardTitle className="text-xl">{menu.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{menu.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Quick Stats (Future: Add real data) */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">전체 사용자</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">-</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">대기 중인 정산</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">-</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">전문가 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">-</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
