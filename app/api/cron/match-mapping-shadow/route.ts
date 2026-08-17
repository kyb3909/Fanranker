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
  // 회당 15행은 주말 물량에 질식한다 (2026-08-16 실측: 스캔 창 241행 중 미처리 121행 —
  // 커뮤니티 실드·라리가 개막 라운드 라인업이 통째로 비었다). 한 경기가 마켓별 4행을
  // 먹으므로 15행 ≈ 4경기/시간이다. 발견(discover) 예산도 6이면 리그 하나를 못 넘긴다.
  const summary = await runMatchMappingShadow(supabase, {
    limit: 40,
    discoverLimit: 15,
    runId: `cron-${new Date().toISOString()}`,
  })

  return NextResponse.json({ success: true, ...summary })
}

export const GET = withCronLog("match-mapping-shadow", handler)
