import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"
import { STANDINGS_LEAGUES } from "@/lib/standings/naver-leagues"

export const dynamic = "force-dynamic"

const ingestSchema = z.object({
  leagueId: z.string().min(1),
  rows: z.array(z.record(z.union([z.string(), z.number()]))).max(100),
  fetchedAt: z.string().datetime().optional(),
})

/**
 * POST /api/cron/standings/ingest
 *
 * VPS 스크래퍼가 Playwright로 수집한 순위표 데이터를 저장.
 * CRON_SECRET Bearer 필수.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const leagueIds = new Set(STANDINGS_LEAGUES.map((l) => l.id))
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("JSON 본문이 필요합니다.")
    }

    const parsed = ingestSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message ?? "잘못된 요청 형식입니다.")
    }

    const { leagueId, rows, fetchedAt } = parsed.data
    if (!leagueIds.has(leagueId)) {
      return apiBadRequest(`지원하지 않는 리그입니다: ${leagueId}`)
    }

    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()
    const fetchedAtIso = fetchedAt ?? now

    const { error } = await supabase.from("standings_cache").upsert(
      {
        league_id: leagueId,
        data: rows,
        fetched_at: fetchedAtIso,
        updated_at: now,
      },
      { onConflict: "league_id" }
    )

    if (error) {
      console.error("[standings/ingest] Supabase error:", error)
      return apiError("순위표 저장 실패", 500, error)
    }

    return NextResponse.json({
      success: true,
      leagueId,
      rowCount: rows.length,
      fetchedAt: fetchedAtIso,
    })
  } catch (error) {
    return apiError("순위표 수집 처리 실패", 500, error)
  }
}
