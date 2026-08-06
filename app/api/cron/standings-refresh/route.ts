import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { STANDINGS_LEAGUES } from "@/lib/standings/naver-leagues"
import { fetchCurrentSeasonCode, fetchTeamsStandings } from "@/lib/standings/naver-fetch"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET /api/cron/standings-refresh — 매일 08:00 KST (vercel.json 23:00 UTC)
 *
 * 순위표 재가동 (2026-08-06, gauntlet R9 / 단계 0-2).
 * 배경: VPS 의 standings-scraper cron 이 2026-03-11 이후 멈춰 standings_cache 가
 * 5개월째 3월 데이터로 얼어 있었다 (죽어도 아무도 모르는 구조 — cron_run_log 밖).
 * 네이버 api-gw 는 순수 fetch 로 충분하므로 Vercel cron 으로 이식하고 withCronLog 로 감시.
 *
 * 시즌 코드 우선순위가 스크립트와 반대다: **실시간 isDefault 조회 우선, 핀은 폴백**.
 * naver-leagues.ts 의 seasonCode 핀은 작성 시점(예: kbo "2025", EPL "lji9"=25-26)에
 * 고정돼 시즌이 바뀌면 조용히 지난 시즌을 가져온다 — 자동 잡에서는 그게 더 위험하다.
 */
async function handler(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  let ok = 0
  let fail = 0
  const details: { leagueId: string; rows: number; seasonCode: string | null; error?: string }[] =
    []

  for (const league of STANDINGS_LEAGUES) {
    const categoryId = league.category ?? league.id

    const seasonCode = (await fetchCurrentSeasonCode(categoryId)) ?? league.seasonCode ?? null
    if (!seasonCode) {
      fail++
      details.push({ leagueId: league.id, rows: 0, seasonCode: null, error: "시즌 코드 없음" })
      continue
    }

    const rows = await fetchTeamsStandings(categoryId, seasonCode)
    if (rows.length === 0) {
      fail++
      details.push({ leagueId: league.id, rows: 0, seasonCode, error: "데이터 없음" })
      continue
    }

    const { error } = await supabase.from("standings_cache").upsert(
      {
        league_id: league.id,
        data: rows,
        fetched_at: now,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id" }
    )

    if (error) {
      fail++
      details.push({ leagueId: league.id, rows: rows.length, seasonCode, error: error.message })
      continue
    }

    ok++
    details.push({ leagueId: league.id, rows: rows.length, seasonCode })

    // 네이버 api-gw 예의상 간격 (스크립트의 300ms 관례 유지)
    await new Promise((r) => setTimeout(r, 300))
  }

  // 전 리그 실패 = 네이버 API 구조 변경/차단 가능성 — cron_run_log 에 error 로 남겨 어드민 모니터에 노출
  if (ok === 0) {
    return apiError(`순위표 갱신 전체 실패 (${fail}개 리그)`, 500, details)
  }

  return NextResponse.json({ success: true, ok, fail, details })
}

export const GET = withCronLog("standings-refresh", handler)
