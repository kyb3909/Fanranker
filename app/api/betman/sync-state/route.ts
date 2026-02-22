import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/betman/sync-state
 *
 * Returns the current sync state from DB.
 * Used by betman-sync.ts and betman-fetch-results.ts to get latestGmTs.
 *
 * Auth: CRON_SECRET Bearer token
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('betman_sync_state')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'sync 상태를 조회할 수 없습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      latestGmTs: data.latest_gm_ts,
      activeRounds: data.active_rounds,
      lastCheckedAt: data.last_checked_at,
      lastSyncAction: data.last_sync_action,
      lastSyncGamesCount: data.last_sync_games_count,
      lastError: data.last_error,
    })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/betman/sync-state
 *
 * Updates the sync state in DB.
 * Called by betman-sync.ts after each sync operation.
 *
 * Body: {
 *   latestGmTs: string,
 *   activeRounds?: string[],
 *   lastSyncAction?: string,       // 'created' | 'updated' | 'checked'
 *   lastSyncGamesCount?: number,
 *   lastError?: string | null,
 * }
 *
 * Auth: CRON_SECRET Bearer token
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const body = await request.json().catch(() => null) as Record<string, unknown> | null

    const supabase = createServiceRoleClient()

    // Get existing row
    const { data: existing } = await supabase
      .from('betman_sync_state')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const updateData: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (body?.latestGmTs != null) {
      updateData.latest_gm_ts = String(body.latestGmTs)
    }
    if (Array.isArray(body?.activeRounds)) {
      updateData.active_rounds = body.activeRounds
    }
    if (body?.lastSyncAction != null) {
      updateData.last_sync_action = String(body.lastSyncAction)
    }
    if (body?.lastSyncGamesCount != null) {
      updateData.last_sync_games_count = Number(body.lastSyncGamesCount)
    }
    if (body?.lastError !== undefined) {
      updateData.last_error = body.lastError ? String(body.lastError) : null
    }

    if (existing) {
      const { error } = await supabase
        .from('betman_sync_state')
        .update(updateData)
        .eq('id', existing.id)

      if (error) {
        return NextResponse.json(
          { error: 'sync 상태 업데이트 실패' },
          { status: 500 }
        )
      }
    } else {
      // First run — insert
      const { error } = await supabase
        .from('betman_sync_state')
        .insert(updateData)

      if (error) {
        return NextResponse.json(
          { error: 'sync 상태 생성 실패' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
