'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  FileText,
  Flag,
  Activity,
  Trophy,
  Newspaper,
  ArrowRight,
} from 'lucide-react'

const quickLinks = [
  { label: '사용자 관리', href: '/admin/users', icon: Users },
  { label: '게시글 관리', href: '/admin/content/posts', icon: FileText },
  { label: '신고 처리', href: '/admin/content/reports', icon: Flag },
  { label: '뉴스 티커', href: '/admin/content/ticker', icon: Newspaper },
  { label: '경기 관리', href: '/admin/matches', icon: Trophy },
  { label: '시스템 상태', href: '/admin/system', icon: Activity },
]

export function DashboardQuickLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">빠른 이동</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Button
                key={link.href}
                variant="outline"
                className="justify-start h-auto py-3"
                asChild
              >
                <Link href={link.href}>
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="text-sm">{link.label}</span>
                  <ArrowRight className="h-3 w-3 ml-auto" />
                </Link>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
