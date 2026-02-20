import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/betman/games
 *
 * Get Betman games for prediction.
 *
 * 게임 조회 우선순위:
 * 1. open 라운드의 scheduled 게임 (새 회차 포함)
 * 2. open 라운드가 없으면 → 가장 최근 라운드의 scheduled 게임
 * 3. scheduled 게임이 전혀 없으면 → 빈 배열
 *
 * Query: sport?, game_type?, round_id?
 */
export async function GET(request: NextRequest) {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const sportFilter = searchParams.get('sport') || 'all'
    const gameTypeFilter = searchParams.get('game_type') || 'all'
    const roundIdFilter = searchParams.get('round_id') || null

    // --- 대상 라운드 결정 ---
    let targetRoundIds: string[] = []

    if (roundIdFilter) {
      // 특정 라운드 지정
      targetRoundIds = [roundIdFilter]
    } else {
      // 1차: open 라운드
      const { data: openRounds } = await supabase
        .from('betman_rounds')
        .select('id')
        .eq('status', 'open')
        .order('round', { ascending: false })

      if (openRounds && openRounds.length > 0) {
        targetRoundIds = openRounds.map(r => r.id)
      } else {
        // 2차: 가장 최근 closed 라운드에서 scheduled 게임 확인
        const { data: recentRounds } = await supabase
          .from('betman_rounds')
          .select('id')
          .in('status', ['closed', 'open'])
          .order('round', { ascending: false })
          .limit(3)

        if (recentRounds && recentRounds.length > 0) {
          targetRoundIds = recentRounds.map(r => r.id)
        }
      }
    }

    // --- 과거 게임 자동 정리: scheduled인데 경기 시간이 지난 게임 → in_progress ---
    await supabase
      .from('betman_games')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('status', 'scheduled')
      .lt('match_time', new Date().toISOString())

    // --- 게임 조회: 미래 경기만 (scheduled + match_time이 현재 이후) ---
    let query = supabase
      .from('betman_games')
      .select('*')
      .eq('status', 'scheduled')
      .gte('match_time', new Date().toISOString())
      .order('match_time', { ascending: true })
      .order('game_no', { ascending: true })

    if (targetRoundIds.length > 0) {
      query = query.in('round_id', targetRoundIds)
    } else {
      query = query.limit(200)
    }

    const allowedSports = ['축구', '야구', '농구', '배구']
    const allowedGameTypes = ['일반', '핸디캡', '언더오버', 'SUM']
    if (sportFilter !== 'all') {
      if (!allowedSports.includes(sportFilter)) {
        return NextResponse.json({ error: '유효하지 않은 종목입니다.' }, { status: 400 })
      }
      query = query.eq('sport', sportFilter)
    }
    if (gameTypeFilter !== 'all') {
      if (!allowedGameTypes.includes(gameTypeFilter)) {
        return NextResponse.json({ error: '유효하지 않은 경기 타입입니다.' }, { status: 400 })
      }
      query = query.or(`game_type.eq.${gameTypeFilter},game_type.eq.S${gameTypeFilter}`)
    }

    const { data: games, error: gamesError } = await query

    if (gamesError) {
      console.error('Failed to fetch betman games:', gamesError)
      return NextResponse.json(
        { error: '경기 목록을 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const gamesWithOdds = (games || []).map((game: Record<string, unknown>) => {
      const rawGameType = (game.game_type as string) || ''
      const gameType = rawGameType === 'SUM' ? 'SUM' : rawGameType.replace(/^S/, '')
      let home_odds, draw_odds, away_odds, over_odds, under_odds, odd_odds, even_odds
      if (gameType === '일반' || gameType === '핸디캡') {
        home_odds = game.home_win_odds != null ? parseFloat(String(game.home_win_odds)) : undefined
        away_odds = game.away_win_odds != null ? parseFloat(String(game.away_win_odds)) : undefined
        draw_odds = game.draw_odds != null ? parseFloat(String(game.draw_odds)) : undefined
      } else if (gameType === '언더오버') {
        over_odds = game.over_odds != null ? parseFloat(String(game.over_odds)) : undefined
        under_odds = game.under_odds != null ? parseFloat(String(game.under_odds)) : undefined
      } else if (gameType === 'SUM') {
        odd_odds = game.odd_odds != null ? parseFloat(String(game.odd_odds)) : undefined
        even_odds = game.even_odds != null ? parseFloat(String(game.even_odds)) : undefined
      }
      return { ...game, home_odds, draw_odds, away_odds, over_odds, under_odds, odd_odds, even_odds }
    })

    const groupedGames: Record<string, { matchKey: string; sport: string; leagueCode: string; homeTeam: string; awayTeam: string; matchTime: string; venue: string; games: typeof gamesWithOdds }> = {}
    gamesWithOdds.forEach((game: any) => {
      const matchKey = `${game.home_team_name}_${game.away_team_name}_${game.match_time}`
      if (!groupedGames[matchKey]) {
        groupedGames[matchKey] = {
          matchKey,
          sport: String(game.sport ?? ''),
          leagueCode: String(game.league_code ?? ''),
          homeTeam: String(game.home_team_name ?? ''),
          awayTeam: String(game.away_team_name ?? ''),
          matchTime: String(game.match_time ?? ''),
          venue: String(game.venue ?? ''),
          games: [],
        }
      }
      groupedGames[matchKey].games.push(game)
    })

    const user = await currentUser()
    let userPredictions: unknown[] = []
    if (user && gamesWithOdds.length > 0) {
      const gameIds = gamesWithOdds.map((g: Record<string, unknown>) => g.id).filter(Boolean)
      const { data: predictions } = await supabase
        .from('betman_predictions')
        .select('*')
        .eq('user_id', user.id)
        .in('game_id', gameIds)
      userPredictions = predictions || []
    }

    // 날짜 라벨: 게임이 있으면 가장 이른 경기 날짜, 없으면 오늘
    const now = new Date()
    const koreaOffset = 9 * 60 * 60 * 1000
    const koreaTime = new Date(now.getTime() + koreaOffset)

    let dateLabel: string
    if (gamesWithOdds.length > 0) {
      const firstMatchTime = new Date(gamesWithOdds[0].match_time as string)
      const firstMatchKST = new Date(firstMatchTime.getTime() + koreaOffset)
      dateLabel = firstMatchKST.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
    } else {
      dateLabel = koreaTime.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })
    }

    // 라운드 정보도 함께 반환
    const { data: roundsInfo } = await supabase
      .from('betman_rounds')
      .select('id, gm_ts, round, status, deadline')
      .in('id', targetRoundIds.length > 0 ? targetRoundIds : ['__none__'])
      .order('round', { ascending: false })

    // 동기화 상태 (프론트엔드에서 "동기화 필요" 표시용)
    const { data: syncState } = await supabase
      .from('betman_sync_state')
      .select('latest_gm_ts, last_sync_action, last_checked_at, last_error')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let syncStatus = 'ok'
    if (syncState?.last_checked_at) {
      const hoursSince = (now.getTime() - new Date(syncState.last_checked_at).getTime()) / (1000 * 60 * 60)
      if (hoursSince > 6) syncStatus = 'urgent'
      else if (hoursSince > 3) syncStatus = 'stale'
    }

    return NextResponse.json({
      today: { date: now.toISOString(), label: dateLabel },
      games: gamesWithOdds,
      groupedGames: Object.values(groupedGames),
      userPredictions,
      total: gamesWithOdds.length,
      rounds: roundsInfo || [],
      syncInfo: {
        status: syncStatus,
        latestGmTs: syncState?.latest_gm_ts,
        lastAction: syncState?.last_sync_action,
        lastChecked: syncState?.last_checked_at,
      },
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/betman/games
 *
 * VPS 또는 n8n에서 게임 데이터를 전송.
 *
 * Body: {
 *   roundId: string (uuid),
 *   games: Array<{ game_no, match_time, sport, game_type, ... }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const body = await request.json().catch(() => ({}))
    const roundId = body.roundId
    const games = Array.isArray(body.games) ? body.games : []

    if (!roundId || typeof roundId !== 'string') {
      return NextResponse.json(
        { error: 'roundId가 필요합니다. 먼저 POST /api/betman/round 로 회차를 생성하세요.' },
        { status: 400 }
      )
    }

    if (games.length === 0) {
      return NextResponse.json(
        { error: 'games 배열이 비어 있습니다.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    const rows = games.map((g: Record<string, unknown>) => {
      const matchTime = g.match_time != null ? String(g.match_time) : null
      return {
        round_id: roundId,
        game_no: Number(g.game_no) || 0,
        match_time: matchTime,
        sport: g.sport != null ? String(g.sport) : '축구',
        game_type: g.game_type != null ? String(g.game_type) : '일반',
        home_team_name: g.home_team_name != null ? String(g.home_team_name) : '',
        away_team_name: g.away_team_name != null ? String(g.away_team_name) : '',
        league_code: g.league_code != null ? String(g.league_code) : null,
        venue: g.venue != null ? String(g.venue) : null,
        status: g.status != null ? String(g.status) : 'scheduled',
        handicap: g.handicap != null ? Number(g.handicap) : null,
        over_under_line: g.over_under_line != null ? Number(g.over_under_line) : null,
        home_win_odds: g.home_win_odds != null ? Number(g.home_win_odds) : null,
        away_win_odds: g.away_win_odds != null ? Number(g.away_win_odds) : null,
        draw_odds: g.draw_odds != null ? Number(g.draw_odds) : null,
        over_odds: g.over_odds != null ? Number(g.over_odds) : null,
        under_odds: g.under_odds != null ? Number(g.under_odds) : null,
        odd_odds: g.odd_odds != null ? Number(g.odd_odds) : null,
        even_odds: g.even_odds != null ? Number(g.even_odds) : null,
      }
    })

    const { error } = await supabase.from('betman_games').upsert(rows, {
      onConflict: 'round_id,game_no',
      ignoreDuplicates: false,
    })

    if (error) {
      console.error('betman_games upsert error:', error)
      return NextResponse.json(
        { error: '경기 목록 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      roundId,
      count: rows.length,
      message: `${rows.length}개 경기가 저장되었습니다.`,
    })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
