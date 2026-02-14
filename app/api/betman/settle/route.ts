import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { updateUserSportStats } from '@/lib/betman/stats'

/**
 * POST /api/betman/settle
 *
 * 완료된 경기의 예측을 정산한다.
 * - 예측 vs 실제 결과 비교 → is_correct 판정
 * - 적중 시 points_earned = 해당 배당률
 * - 미적중 시 points_earned = 0
 * - 취소 경기 예측 → status='cancelled', is_correct=null
 * - 정산 후 유저별 종목 통계 자동 갱신
 *
 * Body: { round_id?: string, gm_ts?: string }
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
    const supabase = createServiceRoleClient()

    // round_id 확보
    let roundId: string | null = body.round_id ?? null

    if (!roundId && body.gm_ts) {
      const { data: round } = await supabase
        .from('betman_rounds')
        .select('id')
        .eq('gm_ts', String(body.gm_ts))
        .single()

      if (round) roundId = round.id
    }

    if (!roundId) {
      return NextResponse.json(
        { error: 'round_id 또는 gm_ts가 필요합니다.' },
        { status: 400 }
      )
    }

    // 1. 해당 라운드의 완료/취소된 경기 조회
    const { data: games, error: gamesError } = await supabase
      .from('betman_games')
      .select('id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds')
      .eq('round_id', roundId)
      .in('status', ['completed', 'cancelled'])

    if (gamesError) {
      return NextResponse.json(
        { error: '경기 조회 실패' },
        { status: 500 }
      )
    }

    if (!games || games.length === 0) {
      return NextResponse.json(
        { error: '정산 가능한 완료된 경기가 없습니다.' },
        { status: 404 }
      )
    }

    // game_id → game 정보 맵
    const gameMap = new Map(games.map(g => [g.id, g]))

    // 2. 해당 경기들에 대한 pending 예측 조회
    const gameIds = games.map(g => g.id)
    const { data: predictions, error: predError } = await supabase
      .from('betman_predictions')
      .select('id, user_id, game_id, prediction, status')
      .in('game_id', gameIds)
      .eq('status', 'pending')

    if (predError) {
      return NextResponse.json(
        { error: '예측 조회 실패' },
        { status: 500 }
      )
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        message: '정산할 pending 예측이 없습니다.',
        settled: 0, correct: 0, wrong: 0, cancelled: 0,
      })
    }

    // 3. 정산 처리
    let settled = 0
    let correct = 0
    let wrong = 0
    let cancelled = 0
    const errors: string[] = []

    for (const pred of predictions) {
      const game = gameMap.get(pred.game_id)
      if (!game) continue

      // 취소된 경기 → 예측도 취소
      if (game.status === 'cancelled') {
        const { error } = await supabase
          .from('betman_predictions')
          .update({
            status: 'cancelled',
            is_correct: null,
            points_earned: 0,
            settled_at: new Date().toISOString(),
          })
          .eq('id', pred.id)

        if (error) {
          errors.push(`pred=${pred.id}: ${error.message}`)
        } else {
          cancelled++
        }
        continue
      }

      // 완료된 경기 → 적중 판정
      const isCorrect = pred.prediction === game.result

      // 적중 시 배당률 계산
      let pointsEarned = 0
      if (isCorrect) {
        const oddsMap: Record<string, number> = {
          home: parseFloat(game.home_win_odds) || 0,
          away: parseFloat(game.away_win_odds) || 0,
          draw: parseFloat(game.draw_odds) || 0,
          over: parseFloat(game.over_odds) || 0,
          under: parseFloat(game.under_odds) || 0,
        }
        pointsEarned = oddsMap[pred.prediction] || 0
      }

      const { error } = await supabase
        .from('betman_predictions')
        .update({
          status: 'settled',
          is_correct: isCorrect,
          points_earned: pointsEarned,
          settled_at: new Date().toISOString(),
        })
        .eq('id', pred.id)

      if (error) {
        errors.push(`pred=${pred.id}: ${error.message}`)
      } else {
        settled++
        if (isCorrect) correct++
        else wrong++
      }
    }

    // 4. 라운드 상태 업데이트
    // 모든 경기가 completed/cancelled면 → settled
    // 아직 scheduled/in_progress 경기가 있으면 → closed (부분 정산)
    const { data: remainingGames } = await supabase
      .from('betman_games')
      .select('id')
      .eq('round_id', roundId)
      .in('status', ['scheduled', 'in_progress'])
      .limit(1)

    const allDone = !remainingGames || remainingGames.length === 0
    await supabase
      .from('betman_rounds')
      .update({
        status: allDone ? 'settled' : 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', roundId)

    // 5. 유저별 종목 통계 갱신
    const affectedUserIds = [...new Set(predictions.map(p => p.user_id))]
    const statsErrors: string[] = []

    for (const userId of affectedUserIds) {
      try {
        await updateUserSportStats(supabase, userId)
      } catch (e) {
        statsErrors.push(`stats user=${userId}: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      roundId,
      roundStatus: allDone ? 'settled' : 'closed',
      settled,
      correct,
      wrong,
      cancelled,
      totalPredictions: predictions.length,
      statsUpdated: affectedUserIds.length,
      errors: [...errors, ...statsErrors].length > 0 ? [...errors, ...statsErrors] : undefined,
    })
  } catch (e) {
    console.error('Settle API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
