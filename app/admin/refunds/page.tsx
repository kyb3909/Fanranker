import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { RefundQueue } from "./refund-queue"

export const metadata: Metadata = { title: "환불 큐" }
export const dynamic = "force-dynamic"

export default async function AdminRefundsPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from("pending_refunds")
    .select("*", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(0, 29)

  const refunds = data ?? []
  const userIds = Array.from(new Set(refunds.map((r) => r.user_id).filter(Boolean)))
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
  const enriched = refunds.map((r) => ({ ...r, nickname: nicknameByUserId[r.user_id] ?? null }))

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">환불 큐</h1>
        <p className="text-muted-foreground text-sm">
          자동 환불이 실패해 보상 큐에 적재된 항목입니다. 재시도하거나 수동 해결 처리하세요.
        </p>
      </div>
      <RefundQueue initialRefunds={enriched} total={count ?? 0} />
    </main>
  )
}
