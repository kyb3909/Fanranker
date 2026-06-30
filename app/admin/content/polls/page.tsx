import { createServiceRoleClient } from "@/lib/supabase/server"
import { PollForm } from "./poll-form"
import { PollList } from "./poll-list"

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
        <PollList polls={rows} />
      </div>
    </main>
  )
}
