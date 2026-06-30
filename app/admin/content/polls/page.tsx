import { createServiceRoleClient } from "@/lib/supabase/server"
import { PollForm } from "./poll-form"

export const dynamic = "force-dynamic"

interface PollRow {
  id: string
  question: string
  is_active: boolean
  created_at: string
  options: { key: string; label: string }[]
}

export default async function AdminPollsPage() {
  const supabase = createServiceRoleClient()
  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, is_active, created_at, options")
    .order("created_at", { ascending: false })
    .limit(30)

  const rows = (polls ?? []) as PollRow[]

  return (
    <main className="p-6">
      <h1 className="mb-1 text-2xl font-bold">설문조사 관리</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        메인 사이드바에 노출될 설문입니다. 새로 만들면 기존 설문은 자동으로 내려갑니다.
      </p>

      <PollForm />

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">설문 목록</h2>
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {p.is_active && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-700">
                    활성
                  </span>
                )}
                <span className="font-medium">{p.question}</span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {(p.options ?? []).map((o) => o.label).join(" · ")}
              </p>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-muted-foreground text-sm">아직 설문이 없습니다.</p>
          )}
        </div>
      </div>
    </main>
  )
}
