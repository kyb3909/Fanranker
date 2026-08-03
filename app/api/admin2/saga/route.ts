import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { publishReservoirItem, type ReservoirPublishRow } from "@/lib/saga/publish"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * /admin2/saga 검수 큐 API (W3) — HITL 이 사가 발행의 유일한 경로 (PRD 게이트).
 *
 *  GET  : queued 항목 + 각 항목의 saga_hint 에 걸리는 기존 사가 (있으면 표시)
 *  POST : { id, action: 'publish' | 'reject', edits? } — 본체는 lib/saga/publish.ts
 */

const EditsSchema = z.object({
  player: z.string().min(1).max(60).optional(),
  player_kr: z.string().max(40).nullable().optional(),
  direction: z.enum(["in", "out"]).optional(),
  stage_signal: z
    .enum(["interest", "contact", "bid", "negotiation", "medical", "done"])
    .nullable()
    .optional(),
  headline_ko: z.string().min(2).max(80).optional(),
})

const ActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["publish", "reject"]),
  edits: EditsSchema.optional(),
})

export async function GET() {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const { data: queue } = await supabase
    .from("saga_reservoir")
    .select(
      "id, source_url, source, title, headline_kr, extracted, saga_hint, cluster_key, occurred_at, created_at"
    )
    .eq("status", "queued")
    .order("occurred_at", { ascending: false })
    .limit(200)

  // saga_hint 로 기존 사가 붙이기 — "이미 열린 문서에 쌓이는 건인지" 표시용
  const hints = [...new Set((queue ?? []).map((q) => q.saga_hint).filter(Boolean))] as string[]
  const { data: sagas } = hints.length
    ? await supabase
        .from("sagas")
        .select("identity_key, slug, title, stage, entry_count, status")
        .in("identity_key", hints)
    : { data: [] }

  return NextResponse.json({ queue: queue ?? [], sagas: sagas ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
  const { id, action, edits } = parsed.data

  const { data: row } = await supabase
    .from("saga_reservoir")
    .select("id, source_url, source, title, headline_kr, extracted, occurred_at")
    .eq("id", id)
    .eq("status", "queued")
    .maybeSingle()
  if (!row) {
    return NextResponse.json({ error: "큐에 없는 항목입니다 (이미 처리됨?)" }, { status: 404 })
  }

  if (action === "reject") {
    await supabase
      .from("saga_reservoir")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
    return NextResponse.json({ ok: true })
  }

  try {
    const result = await publishReservoirItem(supabase, row as unknown as ReservoirPublishRow, {
      ...edits,
      stage_signal: edits?.stage_signal,
    })
    return NextResponse.json({
      ok: true,
      saga: { slug: result.sagaSlug, title: result.sagaTitle },
      folded: result.folded,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "발행 실패" },
      { status: 500 }
    )
  }
}
