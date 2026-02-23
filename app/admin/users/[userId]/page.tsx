import type { Metadata } from "next"
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { UserDetailTabs } from './user-detail-tabs'

export const metadata: Metadata = { title: "사용자 상세" }
export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  return (
    <main id="main-content" tabIndex={-1} className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">사용자 상세</h1>
          <p className="text-sm text-muted-foreground">사용자 정보를 조회하고 관리합니다.</p>
        </div>
      </div>
      <UserDetailTabs userId={userId} />
    </main>
  )
}
