import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { newsCandidateRunId, recordNewsCandidateEvents } from "@/lib/news/candidate-ledger"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/news-expire-drafts  (CRON_SECRET, vercel.json 매시간)
 *
 * 검수 대기(drafted) 중인 뉴스 초안이 생성 후 24시간을 넘기면 자동 반려한다
 * (48h → 24h, 2026-08-04 운영자: "24시간 전 기사는 시의성 잃어버리니 지워지게").
 * 수동 반려와 구분되게 decision 에 reviewer:"auto" / reason:"expired" 기록.
 * status='drafted' 인 것만 대상 — 이미 발행/반려된 건 건드리지 않는다.
 */
const EXPIRE_HOURS = 24

async function handler(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()
  const cutoffIso = new Date(Date.now() - EXPIRE_HOURS * 3600_000).toISOString()

  const { data, error } = await supabase
    .from("news_reservoir")
    .update({
      status: "rejected",
      decision: {
        reviewer: "auto",
        action: "reject",
        reason: "expired",
        expired_hours: EXPIRE_HOURS,
        at: nowIso,
      },
      updated_at: nowIso,
    })
    .eq("status", "drafted")
    .lt("created_at", cutoffIso)
    .select("id")

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const runId = newsCandidateRunId("news-expire-drafts")
  const ledgerRecorded = await recordNewsCandidateEvents(
    supabase,
    (data ?? []).map((row) => ({
      candidate_id: row.id as string,
      reservoir_id: row.id as string,
      to_state: "expired" as const,
      actor: "news-expire-drafts",
      reason_code: "stale_draft_24h",
      details: { cutoff: cutoffIso, expired_hours: EXPIRE_HOURS },
      run_id: runId,
    }))
  )

  return NextResponse.json({
    ok: true,
    expired: data?.length ?? 0,
    cutoff: cutoffIso,
    observability: ledgerRecorded ? "ok" : "degraded",
  })
}

export const GET = withCronLog("news-expire-drafts", handler)
export const POST = handler
