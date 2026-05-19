import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { MetaverseReportQueue } from "./metaverse-report-queue"

export const metadata: Metadata = { title: "메타버스 신고 관리" }
export const dynamic = "force-dynamic"

export default async function AdminMetaverseReportsPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from("metaverse_user_reports")
    .select("*", { count: "exact" })
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .range(0, 29)

  const reports = data ?? []
  const userIds = Array.from(
    new Set(reports.flatMap((r) => [r.reporter_user_id, r.reported_user_id]).filter(Boolean))
  )

  const nicknameByUserId: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", userIds)
    for (const p of profiles ?? []) {
      if (p.nickname) nicknameByUserId[p.user_id] = p.nickname
    }
  }

  const enriched = reports.map((r) => ({
    ...r,
    reporter_nickname: nicknameByUserId[r.reporter_user_id] ?? null,
    reported_nickname: nicknameByUserId[r.reported_user_id] ?? null,
  }))

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">메타버스 신고 관리</h1>
        <p className="text-muted-foreground text-sm">
          메타버스 내 유저 신고를 검토하고 처리합니다. (open → reviewed/dismissed/actioned)
        </p>
      </div>
      <MetaverseReportQueue initialReports={enriched} total={count ?? 0} />
    </main>
  )
}
