import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fillMissingSummaries } from "@/lib/ticker/summary-store"
import { TICKER_BOT_BY_ROOT, TICKER_WINDOW_MS } from "@/lib/ticker/from-posts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET/POST /api/cron/ticker-summaries  (CRON_SECRET, vercel.json 30분마다)
 *
 * 떡밥(뉴스봇 글) 요약을 채운다 (2026-09-18 운영자: "오늘의 떡밥 기사들을 3줄 요약 형식으로 …
 * 인터뷰라면 무슨 얘기를 했는지만"). 요약이 없거나 본문이 바뀐 글만 LLM 을 부른다 —
 * 24시간 창 안의 봇 글 최대 60건 중 한 번에 20건. 봇 발행량이 하루 ~20건이라 대개 0~3건이다.
 *
 * 요약이 없는 글은 티커·떡밥 카드가 종전대로 글 페이지로 보낸다 — 이 작업이 멈춰도 화면은
 * 안 깨진다. 접지 검사(본문에 없는 숫자·발언)에 걸린 글은 요약 없이 남는다(fail-closed).
 */
async function handler(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const db = createServiceRoleClient()
  const since = new Date(Date.now() - TICKER_WINDOW_MS).toISOString()
  const { data: posts, error } = await db
    .from("posts")
    .select("id, title, content, source_url, source_name, created_at")
    .in("user_id", Object.values(TICKER_BOT_BY_ROOT))
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { previews: _previews, ...result } = await fillMissingSummaries(db, posts ?? [], {
    limit: 20,
    apply: true,
  })
  return NextResponse.json({ ok: true, posts: posts?.length ?? 0, ...result })
}

export const GET = withCronLog("ticker-summaries", handler)
export const POST = withCronLog("ticker-summaries", handler)
