import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import {
  publishReservoirItem,
  type ReservoirPublishRow,
  type PublishEdits,
} from "@/lib/saga/publish"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * 사가 큐 수동 배치 발행 도구 (vercel.json 미등록 — 스케줄 없음, CRON_SECRET 필수).
 * /admin2/saga 화면과 같은 publishReservoirItem 경로 — 운영자가 CLI 로 검수 발행할 때 사용.
 *
 * 호출: POST { items: [{ id, edits? }] }  (Authorization: Bearer CRON_SECRET)
 */
export async function POST(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as {
    items?: { id: string; edits?: PublishEdits }[]
  } | null
  const items = (body?.items ?? []).slice(0, 20)
  if (items.length === 0) return NextResponse.json({ error: "items 필요" }, { status: 400 })

  const supabase = createServiceRoleClient()
  const results: unknown[] = []
  for (const item of items) {
    const { data: row } = await supabase
      .from("saga_reservoir")
      .select("id, source_url, source, title, headline_kr, extracted, occurred_at")
      .eq("id", item.id)
      .eq("status", "queued")
      .maybeSingle()
    if (!row) {
      results.push({ id: item.id, error: "큐에 없음" })
      continue
    }
    try {
      const r = await publishReservoirItem(
        supabase,
        row as unknown as ReservoirPublishRow,
        item.edits ?? {}
      )
      results.push({ id: item.id, saga: r.sagaSlug, folded: r.folded })
    } catch (e) {
      results.push({ id: item.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ results })
}
