import type { Metadata } from "next"
import { MatchManagementTable } from './match-table'

export const metadata: Metadata = { title: "경기 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminMatchesPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">경기 관리</h1>
        <p className="text-sm text-muted-foreground">예측된 경기 목록을 조회하고 관리합니다.</p>
      </div>
      <MatchManagementTable />
    </main>
  )
}
