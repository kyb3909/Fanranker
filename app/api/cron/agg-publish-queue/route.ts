import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { publishQueueItem, type AggQueueItem } from "@/lib/agg/publish"

export const dynamic = "force-dynamic"

/**
 * 발행 분산 큐 워커 (F17) — 10분 주기 Vercel cron.
 * 검수 페이지에서 승인(approved + scheduled_at)된 페르소나 글 중 시각이 도래한 것을
 * 순차 게시한다. 관리자가 몰아서 검수해도 담벼락에는 20~60분 간격으로 자연 분산.
 */
async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from("agg_reservoir")
    .select("id, rewritten, media, audit")
    .eq("status", "approved")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(3)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, published: 0 })
  }

  let published = 0
  const errors: string[] = []
  for (const item of due as AggQueueItem[]) {
    const result = await publishQueueItem(supabase, item)
    if (result.error) {
      errors.push(`${item.id}: ${result.error}`)
      // 반복 실패로 큐가 막히지 않게 실패 항목은 rejected 처리 (검수 페이지 재등록 가능)
      await supabase
        .from("agg_reservoir")
        .update({ status: "rejected", reject_reason: `queue: ${result.error}`.slice(0, 200) })
        .eq("id", item.id)
      continue
    }
    published++
  }

  return NextResponse.json({ ok: true, published, ...(errors.length ? { errors } : {}) })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
