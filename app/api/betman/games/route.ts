import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/betman/games
 *
 * Get Betman games for prediction
 * 오늘 날짜(한국시간 기준)의 경기만 표시
 *
 * Query: sport?, game_type?
 */
export async function GET(request: NextRequest) {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const sportFilter = searchParams.get('sport') || 'all'
    const gameTypeFilter = searchParams.get('game_type') || 'all'

    const now = new Date()
    const koreaOffset = 9 * 60 * 60 * 1000
    const koreaTime = new Date(now.getTime() + koreaOffset)
    const todayKST = new Date(koreaTime)
    todayKST.setUTCHours(0, 0, 0, 0)
    const tomorrowKST = new Date(todayKST)
    tomorrowKST.setUTCDate(tomorrowKST.getUTCDate() + 1)
    const startTimeUTC = new Date(todayKST.getTime() - koreaOffset)
    const endTimeUTC = new Date(tomorrowKST.getTime() - koreaOffset)
    const startTimeISO = startTimeUTC.toISOString()
    const endTimeISO = endTimeUTC.toISOString()

    let query = supabase
      .from('betman_games')
      .select('*')
      .eq('status', 'scheduled')
      .gte('match_time', startTimeISO)
      .lt('match_time', endTimeISO)
      .order('match_time', { ascending: true })
      .order('game_no', { ascending: true })

    if (sportFilter !== 'all') query = query.eq('sport', sportFilter)
    if (gameTypeFilter !== 'all') query = query.or(`game_type.eq.${gameTypeFilter},game_type.eq.S${gameTypeFilter}`)

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
      // 'S일반', 'S핸디캡' 등에서 앞의 S를 제거하되, 'SUM'은 그대로 유지
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
    gamesWithOdds.forEach((game: Record<string, unknown>) => {
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

    const todayLabel = koreaTime.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

    return NextResponse.json({
      today: { date: startTimeISO, label: todayLabel },
      games: gamesWithOdds,
      groupedGames: Object.values(groupedGames),
      userPredictions,
      total: gamesWithOdds.length,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/betman/games
 *
 * n8n이 gameSlip.do 페이지 테이블을 크롤링한 뒤, 경기 목록을 보낼 때 사용.
 * roundId는 먼저 POST /api/betman/round 로 회차 생성 후 받은 roundId.
 *
 * Body: {
 *   roundId: string (uuid),
 *   games: Array<{
 *     game_no: number,
 *     match_time: string (ISO),
 *     sport: string,
 *     game_type: string,
 *     home_team_name: string,
 *     away_team_name: string,
 *     league_code?: string,
 *     venue?: string,
 *     home_win_odds?, away_win_odds?, draw_odds?, over_odds?, under_odds?, odd_odds?, even_odds?
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
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
        // 핸디캡 스프레드 (핸디캡 게임용)
        handicap: g.handicap != null ? Number(g.handicap) : null,
        // 언오버 기준선 (언오버 게임용)
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
        { error: '경기 목록 저장 중 오류가 발생했습니다.', details: error.message },
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
