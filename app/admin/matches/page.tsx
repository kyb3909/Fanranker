import type { Metadata } from "next"
import { MatchManagementTable } from "./match-table"
import { DailyScheduleTable } from "./daily-schedule-table"

export const metadata: Metadata = { title: "경기 관리" }
export const dynamic = "force-dynamic"

export default async function AdminMatchesPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">경기 관리</h1>
        <p className="text-muted-foreground text-sm">
          Betman 동기화·결과 확인용 일정표와 전체 경기 목록을 관리합니다.
        </p>
      </div>
      <div className="space-y-6">
        <DailyScheduleTable />
        <div>
          <h2 className="mb-3 text-lg font-semibold">전체 경기 목록</h2>
          <MatchManagementTable />
        </div>
      </div>
    </main>
  )
}
