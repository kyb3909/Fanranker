import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { publishReservoirItem, type ReservoirPublishRow } from "@/lib/saga/publish"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * 사가 검수 큐 API (W3) — 운영자 수동 검수·발행 경로. UI 는 /admin/news-review 의
 * SagaReviewQueue. (2026-08-08 감사 P1-6: /api/admin2/saga 에서 정본 트리로 이전 —
 * "검수 API 가 폐기 대상 admin2 에 있다"는 경로-정책 불일치 해소, 구 경로는 위임)
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

  const { data: queue, error: queueError } = await supabase
    .from("saga_reservoir")
    .select(
      "id, source_url, source, title, headline_kr, extracted, saga_hint, cluster_key, occurred_at, created_at"
    )
    .eq("status", "queued")
    .order("occurred_at", { ascending: false })
    .limit(200)
  if (queueError) {
    console.error("[admin/saga-review] queued 목록 조회 실패", queueError)
    return NextResponse.json({ error: "사가 검수 큐 조회 실패" }, { status: 500 })
  }

  // saga_hint 로 기존 사가 붙이기 — "이미 열린 문서에 쌓이는 건인지" 표시용
  const hints = [...new Set((queue ?? []).map((q) => q.saga_hint).filter(Boolean))] as string[]
  const { data: sagas, error: sagasError } = hints.length
    ? await supabase
        .from("sagas")
        .select("identity_key, slug, title, stage, entry_count, status")
        .in("identity_key", hints)
    : { data: [], error: null }
  if (sagasError) {
    console.error("[admin/saga-review] 기존 사가 조회 실패", sagasError)
    return NextResponse.json({ error: "기존 사가 조회 실패" }, { status: 500 })
  }

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

  const { data: row, error: rowError } = await supabase
    .from("saga_reservoir")
    .select("id, source_url, source, title, headline_kr, extracted, occurred_at")
    .eq("id", id)
    .eq("status", "queued")
    .maybeSingle()
  if (rowError) {
    console.error("[admin/saga-review] 큐 항목 조회 실패", rowError)
    return NextResponse.json({ error: "큐 항목 조회 실패" }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "큐에 없는 항목입니다 (이미 처리됨?)" }, { status: 404 })
  }

  if (action === "reject") {
    const { error: rejectError } = await supabase
      .from("saga_reservoir")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
    if (rejectError) {
      console.error("[admin/saga-review] 큐 항목 반려 실패", rejectError)
      return NextResponse.json({ error: "큐 항목 반려 실패" }, { status: 500 })
    }
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
