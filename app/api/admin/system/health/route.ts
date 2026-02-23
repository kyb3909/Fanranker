import { NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { apiError } from '@/lib/api-error'

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { supabase } = auth

    const [
      { data: syncState },
      { data: crawlerRuns },
      { data: dailyRound },
      { count: tickerCount },
    ] = await Promise.all([
      supabase.from('betman_sync_state').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('crawler_run_log').select('*').order('started_at', { ascending: false }).limit(10),
      supabase.from('betman_daily_rounds').select('*').order('daily_id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('news_ticker_items').select('*', { count: 'exact', head: true }),
    ])

    // Betman 동기화 상태 체크: 3시간 이상 미동기화 시 warning
    let betmanSyncWarning: string | null = null
    if (syncState?.updated_at) {
      const lastSync = new Date(syncState.updated_at)
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
      if (hoursSinceSync > 3) {
        betmanSyncWarning = `Betman 동기화 ${Math.floor(hoursSinceSync)}시간 경과 (마지막: ${lastSync.toISOString()})`
      }
    } else {
      betmanSyncWarning = 'Betman 동기화 상태 데이터 없음'
    }

    return NextResponse.json({
      betmanSync: syncState,
      betmanSyncWarning,
      crawlerRuns,
      dailyRound,
      tickerCount: tickerCount ?? 0,
    })
  } catch (error) {
    return apiError('서버 오류', 500, error)
  }
}
