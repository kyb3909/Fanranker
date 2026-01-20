import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/admin/matches/list
 *
 * Get list of matches with prediction counts (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const supabase = await createClient()

    // Get matches with prediction counts by grouping predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('match_id, sport_type, matches(match_time, is_prediction_open)')
      .order('created_at', { ascending: false })

    if (predictionsError) {
      console.error('Failed to fetch predictions:', predictionsError)
      return NextResponse.json(
        { error: '경기 목록을 가져오는 중 오류가 발생했습니다.', details: predictionsError.message },
        { status: 500 }
      )
    }

    // Group by match_id and count predictions
    const matchMap = new Map<
      string,
      {
        match_id: string
        sport_type: string
        match_time: string | null
        is_prediction_open: boolean | null
        prediction_count: number
      }
    >()

    for (const pred of predictions || []) {
      const matchId = pred.match_id
      const existing = matchMap.get(matchId)

      if (existing) {
        existing.prediction_count += 1
      } else {
        const matchData = Array.isArray(pred.matches) ? pred.matches[0] : pred.matches
        matchMap.set(matchId, {
          match_id: matchId,
          sport_type: pred.sport_type || 'unknown',
          match_time: matchData?.match_time || null,
          is_prediction_open: matchData?.is_prediction_open ?? null,
          prediction_count: 1,
        })
      }
    }

    const matches = Array.from(matchMap.values()).sort((a, b) => {
      if (a.match_time && b.match_time) {
        return new Date(b.match_time).getTime() - new Date(a.match_time).getTime()
      }
      return 0
    })

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
