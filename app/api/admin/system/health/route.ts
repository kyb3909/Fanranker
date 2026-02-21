import { NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'

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

    return NextResponse.json({
      betmanSync: syncState,
      crawlerRuns,
      dailyRound,
      tickerCount: tickerCount ?? 0,
    })
  } catch (error) {
    console.error('System health API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
