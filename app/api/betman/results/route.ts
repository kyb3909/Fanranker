import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * POST /api/betman/results
 *
 * 크롤링 스크립트(betman-fetch-results.ts)가 호출.
 * betman_games 테이블의 결과(home_score, away_score, result, status)를 업데이트.
 *
 * Body: {
 *   gmTs: string,
 *   results: Array<{
 *     game_no: number,
 *     home_score: number | null,
 *     away_score: number | null,
 *     result: string,   // 'home' | 'draw' | 'away' | 'over' | 'under' | 'cancelled' | ''
 *     status: string,   // 'completed' | 'cancelled'
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 인증: CRON_SECRET으로 내부 호출만 허용
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const gmTs = body.gmTs
    const results: Array<{
      game_no: number
      home_score: number | null
      away_score: number | null
      result: string
      status: string
    }> = Array.isArray(body.results) ? body.results : []

    if (!gmTs) {
      return NextResponse.json(
        { error: 'gmTs가 필요합니다.' },
        { status: 400 }
      )
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'results 배열이 비어 있습니다.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // gmTs로 round_id 조회
    const { data: round, error: roundError } = await supabase
      .from('betman_rounds')
      .select('id')
      .eq('gm_ts', String(gmTs))
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: `gmTs=${gmTs}에 해당하는 회차를 찾을 수 없습니다.` },
        { status: 404 }
      )
    }

    const roundId = round.id
    let updated = 0
    let cancelled = 0
    const errors: string[] = []

    // 각 경기 결과 업데이트
    for (const r of results) {
      const updateData: Record<string, unknown> = {
        status: r.status,
        updated_at: new Date().toISOString(),
      }

      // home_score, away_score 설정 (null이 아닌 경우만)
      if (r.home_score !== null) updateData.home_score = r.home_score
      if (r.away_score !== null) updateData.away_score = r.away_score

      // result 설정 (빈 문자열이면 null 유지 — SUM 게임)
      if (r.result && r.result !== '') {
        updateData.result = r.result
      }

      const { error: updateError } = await supabase
        .from('betman_games')
        .update(updateData)
        .eq('round_id', roundId)
        .eq('game_no', r.game_no)

      if (updateError) {
        errors.push(`game_no=${r.game_no}: ${updateError.message}`)
      } else {
        if (r.status === 'cancelled') {
          cancelled++
        } else {
          updated++
        }
      }
    }

    return NextResponse.json({
      roundId,
      gmTs,
      updated,
      cancelled,
      total: results.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updated}건 업데이트, ${cancelled}건 취소 처리 완료`,
    })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
