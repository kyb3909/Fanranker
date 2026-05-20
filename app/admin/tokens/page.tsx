import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { TokenMonitoringTable } from "./token-table"
import { EconomyHealthCards, type TypeAgg } from "./economy-health"

export const metadata: Metadata = { title: "토큰 관리" }
export const dynamic = "force-dynamic"

function aggregate(rows: { transaction_type: string; amount: number }[] | null): TypeAgg {
  const byType: TypeAgg = {}
  for (const r of rows ?? []) {
    const t = (byType[r.transaction_type] ??= { count: 0, sum: 0 })
    t.count++
    t.sum += r.amount ?? 0
  }
  return byType
}

export default async function AdminTokensPage() {
  const supabase = createServiceRoleClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: tokenTx }, { data: goldTx }] = await Promise.all([
    supabase.from("token_transactions").select("transaction_type, amount").gte("created_at", since),
    supabase.from("gold_transactions").select("transaction_type, amount").gte("created_at", since),
  ])

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">토큰 모니터링</h1>
        <p className="text-muted-foreground text-sm">
          모든 사용자의 사이버 토큰 잔액 및 거래 내역을 조회합니다.
        </p>
      </div>
      <EconomyHealthCards token={aggregate(tokenTx)} gold={aggregate(goldTx)} periodDays={7} />
      <TokenMonitoringTable />
    </main>
  )
}
