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
        <p className="text-muted-foreground text-sm">메타버스 안에서 들어온 유저 신고입니다.</p>
        {/* 일반 신고의 "인정"과 같은 완료로 읽히면 안 된다 — 여기 버튼은 상태만 기록한다 */}
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          이 화면의 조치는 <b>상태를 기록할 뿐</b> 계정 정지·차단·음소거를 실행하지 않습니다. 카드
          발급이나 제재가 필요하면 일반 신고 화면에서 따로 처리해야 합니다.
        </p>
      </div>
      <MetaverseReportQueue initialReports={enriched} total={count ?? 0} />
    </main>
  )
}
