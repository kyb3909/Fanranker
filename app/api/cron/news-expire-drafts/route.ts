import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/news-expire-drafts  (CRON_SECRET, vercel.json 매시간)
 *
 * 검수 대기(drafted) 중인 뉴스 초안이 생성 후 48시간을 넘기면 자동 반려한다.
 * 뉴스는 신선도가 생명이라, 이틀 지난 소식은 발행 가치가 없다고 보고 큐에서 내린다.
 * 수동 반려와 구분되게 decision 에 reviewer:"auto" / reason:"expired" 기록.
 * status='drafted' 인 것만 대상 — 이미 발행/반려된 건 건드리지 않는다.
 */
const EXPIRE_HOURS = 48

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

  return NextResponse.json({ ok: true, expired: data?.length ?? 0, cutoff: cutoffIso })
}

export const GET = handler
export const POST = handler
