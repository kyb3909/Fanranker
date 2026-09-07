import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { runMatchMappingShadow } from "@/lib/soccerway/match-mapping"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron/match-mapping-shadow — 매시 :41 (vercel.json)
 *
 * 실록 단계 2: betman↔Soccerway 경기 매핑 shadow (2026-08-07).
 * 다가오는 축구 경기를 팀 사전으로 해석해 soccerway 구성 URL 대조 결과를
 * match_mapping_attempts 에만 기록한다. **betman_games 는 쓰지 않는다** —
 * 실기록은 골든셋 게이트(G-매칭) 통과 후.
 *
 * 킬스위치: MATCH_MAPPING_SHADOW=shadow 일 때만 동작 (미설정 = off).
 */
async function handler(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (process.env.MATCH_MAPPING_SHADOW !== "shadow") {
    return NextResponse.json({ success: true, skipped: "MATCH_MAPPING_SHADOW off" })
  }

  const supabase = createServiceRoleClient()
  // Discover the full window; cap external processing at 40 distinct matches.
  // Persisted attempt times rotate retries, independently of betting-market count.
  //
  // 과거 창 72시간 (2026-09-07, 종전 24시간). 봉인이 풀린 경기(사전 수정·lfa_ 가드)가 24시간
  // 안에 재판정되지 못하면 자동으로는 영영 안 돌아왔다 — 9/5 분데스리가 4경기가 그렇게 남았다.
  // 이미 판정된 경기는 DB 만 보고 넘어가므로(settled skip) 외부 호출·크레딧은 늘지 않는다.
  const summary = await runMatchMappingShadow(supabase, {
    limit: 40,
    discoverLimit: 15,
    lookbackHours: 72,
    runId: `cron-${new Date().toISOString()}`,
  })

  const success = summary.errors.length === 0 && summary.fetchError === 0
  return NextResponse.json({ success, ...summary }, { status: success ? 200 : 503 })
}

export const GET = withCronLog("match-mapping-shadow", handler)
