import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { computeDailyId, getTodayDailyId, formatDailyIdLabel, getBetOpenAt, getBetCloseAt, getBettingWindowStatus, getDailyWindow, getGameBetDeadline } from '@/lib/betman/daily-round'

/**
 * GET /api/betman/games
 *
 * Get Betman games for prediction using a fixed daily window.
 *
 * Query: sport?, game_type?, date? (YYYY-MM-DD, defaults to today)
 *
 * Daily round: resets at 23:00 KST. Shows games from 08:00 KST ~ next 08:00 KST.
 * Bet deadline = kickoff time. No time-of-day betting restriction.
 * One daily round may contain games from multiple betman gmTs rounds.
 */
export async function GET(request: NextRequest) {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const sportFilter = searchParams.get('sport') || 'all'
    const gameTypeFilter = searchParams.get('game_type') || 'all'
    const dateParam = searchParams.get('date') // YYYY-MM-DD or null (today)

    // Validate date param if provided
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }, { status: 400 })
    }

    // --- Fixed daily window: [date 08:00 KST, date+1 08:00 KST) ---
    const { start: windowStart, end: windowEnd, dailyId } = getDailyWindow(dateParam || undefined)
    const now = new Date()

    // --- Auto-expire past games: scheduled → in_progress ---
    // 현재 시간 기준으로 이미 시작된 경기 상태 업데이트
    await supabase
      .from('betman_games')
      .update({ status: 'in_progress', updated_at: now.toISOString() })
      .eq('status', 'scheduled')
      .lt('match_time', now.toISOString())

    // --- Auto-close past daily rounds ---
    await supabase
      .from('betman_daily_rounds')
      .update({ status: 'closed', updated_at: now.toISOString() })
      .eq('status', 'open')
      .lt('bet_close_at', now.toISOString())

    // --- Fetch games in daily window (kickoff-time based) ---
    const isToday = !dateParam || dailyId === getTodayDailyId()
    let query = supabase
      .from('betman_games')
      .select('*')
      .gte('match_time', windowStart.toISOString())
      .lt('match_time', windowEnd.toISOString())
      .order('match_time', { ascending: true })
      .order('game_no', { ascending: true })

    // 오늘 경기는 scheduled만, 과거 날짜는 전체 상태 반환
    if (isToday) {
      query = query.eq('status', 'scheduled')
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

    // Betting window status
    const windowStatus = getBettingWindowStatus()

    const gamesWithOdds = (games || []).map((game) => {
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
      // Per-game bet deadline = kickoff time
      const betCloseAt = getGameBetDeadline(game.match_time as string)
      const now = new Date()
      const isBettable = now < betCloseAt
      return { ...game, home_odds, draw_odds, away_odds, over_odds, under_odds, odd_odds, even_odds, bet_close_at: betCloseAt.toISOString(), is_bettable: isBettable }
    })

    const groupedGames: Record<string, { matchKey: string; sport: string; leagueCode: string; homeTeam: string; awayTeam: string; matchTime: string; venue: string; games: typeof gamesWithOdds }> = {}
    gamesWithOdds.forEach((game) => {
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
      const gameIds = gamesWithOdds.map((g) => g.id).filter(Boolean)
      const { data: predictions } = await supabase
        .from('betman_predictions')
        .select('*')
        .eq('user_id', user.id)
        .in('game_id', gameIds)
      userPredictions = predictions || []
    }

    // 동기화 상태 (프론트엔드에서 "동기화 필요" 표시용)
    const { data: syncState } = await supabase
      .from('betman_sync_state')
      .select('latest_gm_ts, last_sync_action, last_checked_at, last_error')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let syncStatus = 'ok'
    if (syncState?.last_checked_at) {
      const hoursSince = (windowStart.getTime() - new Date(syncState.last_checked_at).getTime()) / (1000 * 60 * 60)
      if (hoursSince > 6) syncStatus = 'urgent'
      else if (hoursSince > 3) syncStatus = 'stale'
    }

    // Find the earliest bet_close_at among bettable games (for countdown)
    const bettableGames = gamesWithOdds.filter((g) => g.is_bettable)
    const earliestBetClose = bettableGames.length > 0
      ? bettableGames.reduce((earliest: string, g) =>
          g.bet_close_at < earliest ? g.bet_close_at : earliest,
          bettableGames[0].bet_close_at
        )
      : null

    return NextResponse.json({
      // Daily window info: [08:00 KST today, 08:00 KST tomorrow)
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        dailyId,
      },
      today: { date: windowStart.toISOString(), label: formatDailyIdLabel(dailyId) },
      dailyRound: null, // No longer used for display — kept for API compat
      bettingWindow: windowStatus,
      earliestBetClose,
      games: gamesWithOdds,
      groupedGames: Object.values(groupedGames),
      userPredictions,
      total: gamesWithOdds.length,
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
 * VPS에서 게임 데이터를 전송. 자동으로 daily round에 배정.
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

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
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

    // --- Auto-assign daily round IDs ---
    const dailyGroups = new Map<string, number>()
    for (const row of rows) {
      if (!row.match_time) continue
      const dailyId = computeDailyId(row.match_time)
      dailyGroups.set(dailyId, (dailyGroups.get(dailyId) || 0) + 1)
    }

    let dailyRoundsCreated = 0
    for (const [dailyId] of dailyGroups) {
      const betOpen = getBetOpenAt(dailyId)
      const betClose = getBetCloseAt(dailyId)

      const { data: dr } = await supabase
        .from('betman_daily_rounds')
        .upsert(
          { daily_id: dailyId, bet_open_at: betOpen, bet_close_at: betClose },
          { onConflict: 'daily_id' }
        )
        .select('id')
        .single()

      if (dr) {
        await supabase.rpc('assign_daily_round', {
          p_daily_id: dailyId,
          p_daily_round_id: dr.id,
        })
        dailyRoundsCreated++
      }
    }

    return NextResponse.json({
      roundId,
      count: rows.length,
      dailyRoundsProcessed: dailyRoundsCreated,
      message: `${rows.length}개 경기가 저장되었습니다. (${dailyRoundsCreated}개 일일 라운드 처리)`,
    })
  } catch (e) {
    console.error('API error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
