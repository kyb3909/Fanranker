import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { syncSingleGmTs } from '@/app/api/cron/betman-sync/route'

/**
 * POST /api/betman/manual-sync
 *
 * 관리자가 수동으로 특정 gmTs를 동기화하는 폴백 엔드포인트.
 * Vercel cron이 실패했거나, VPS 스크래퍼가 동작하지 않을 때 사용.
 *
 * Body:
 *   { gmTs: "260021" }           - 단일 gmTs
 *   { gmTs: ["260021","260022"] } - 복수 gmTs
 *
 * Auth: CRON_SECRET Bearer token
 *
 * 사용법:
 *   curl -X POST https://your-domain/api/betman/manual-sync \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"gmTs":"260021"}'
 */
export async function POST(request: NextRequest) {
  const start = Date.now()

  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // gmTs를 단일 또는 배열로 받기
    let gmTsList: string[] = []
    if (Array.isArray(body.gmTs)) {
      gmTsList = body.gmTs.map((v: unknown) => String(v).trim()).filter(Boolean)
    } else if (body.gmTs) {
      gmTsList = [String(body.gmTs).trim()]
    }

    if (gmTsList.length === 0) {
      return NextResponse.json(
        { error: 'gmTs가 필요합니다. 예: {"gmTs":"260021"} 또는 {"gmTs":["260021","260022"]}' },
        { status: 400 },
      )
    }

    // 유효성 검사: gmTs는 숫자 문자열이어야 함
    for (const gmTs of gmTsList) {
      if (!/^\d+$/.test(gmTs)) {
        return NextResponse.json(
          { error: `유효하지 않은 gmTs: "${gmTs}" (숫자만 가능)` },
          { status: 400 },
        )
      }
    }

    const supabase = createServiceRoleClient()

    const results: Array<{
      gmTs: string
      action: string
      roundId: string
      games: number
      errors: number
    }> = []
    const errors: string[] = []

    for (const gmTs of gmTsList) {
      const result = await syncSingleGmTs(supabase, gmTs)

      if ('error' in result) {
        errors.push(result.error)
        console.error(`[manual-sync] gmTs ${gmTs} 실패:`, result.error)
        continue
      }

      results.push({ gmTs, ...result })
    }

    // sync_state 업데이트
    const latestGmTs = gmTsList[gmTsList.length - 1]
    const totalGames = results.reduce((sum, r) => sum + r.games, 0)

    const { data: existing } = await supabase
      .from('betman_sync_state')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const updateData = {
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      latest_gm_ts: latestGmTs,
      last_sync_action: 'manual_sync',
      last_sync_games_count: totalGames,
      last_error: errors.length > 0 ? errors.join('; ') : null,
    }

    if (existing) {
      await supabase.from('betman_sync_state').update(updateData).eq('id', existing.id)
    } else {
      await supabase.from('betman_sync_state').insert(updateData)
    }

    const duration = Date.now() - start

    return NextResponse.json({
      ok: true,
      rounds: gmTsList.length,
      results,
      errors,
      totalGames,
      duration: `${duration}ms`,
    })
  } catch (error) {
    console.error('[manual-sync] Unexpected error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
