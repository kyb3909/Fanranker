import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface OddsData {
  homeWin?: number
  awayWin?: number
  draw?: number
  over?: number
  under?: number
  odd?: number
  even?: number
}

interface GameOdds {
  gameNo: number
  gameType: string
  homeTeam: string
  awayTeam: string
  odds: OddsData
}

interface BetmanData {
  year: number
  round: number
  games: Record<string, any>
  oddsHistory: Array<{
    timestamp: string
    odds: Record<string, GameOdds>
  }>
}

async function importOdds() {
  // JSON 파일 읽기
  const jsonPath = path.join(process.cwd(), '2026_11회차.json')
  const jsonData: BetmanData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  // 가장 최근 oddsHistory 사용
  const latestOdds = jsonData.oddsHistory[jsonData.oddsHistory.length - 1]

  if (!latestOdds) {
    console.error('No odds history found')
    return
  }

  console.log(`Processing odds from: ${latestOdds.timestamp}`)

  // 해당 회차의 round_id 조회
  const { data: round, error: roundError } = await supabase
    .from('betman_rounds')
    .select('id')
    .eq('year', jsonData.year)
    .eq('round', jsonData.round)
    .single()

  if (roundError || !round) {
    console.error('Round not found:', roundError)
    return
  }

  console.log(`Found round ID: ${round.id}`)

  // 각 게임의 배당률 업데이트
  let updateCount = 0
  for (const [gameKey, gameData] of Object.entries(latestOdds.odds)) {
    if (!gameData.odds || Object.keys(gameData.odds).length === 0) {
      continue
    }

    const updateData: Record<string, number | null> = {
      home_win_odds: null,
      away_win_odds: null,
      draw_odds: null,
      over_odds: null,
      under_odds: null,
      odd_odds: null,
      even_odds: null,
    }

    // 게임 타입에 따라 배당률 매핑
    const odds = gameData.odds
    if ('homeWin' in odds) updateData.home_win_odds = odds.homeWin!
    if ('awayWin' in odds) updateData.away_win_odds = odds.awayWin!
    if ('draw' in odds) updateData.draw_odds = odds.draw!
    if ('over' in odds) updateData.over_odds = odds.over!
    if ('under' in odds) updateData.under_odds = odds.under!
    if ('odd' in odds) updateData.odd_odds = odds.odd!
    if ('even' in odds) updateData.even_odds = odds.even!

    // 업데이트
    const { error: updateError } = await supabase
      .from('betman_games')
      .update(updateData)
      .eq('round_id', round.id)
      .eq('game_no', gameData.gameNo)

    if (updateError) {
      console.error(`Failed to update game ${gameData.gameNo}:`, updateError)
    } else {
      updateCount++
      console.log(`Updated game ${gameData.gameNo} (${gameData.gameType}): ${JSON.stringify(odds)}`)
    }
  }

  console.log(`\nTotal games updated: ${updateCount}`)
}

importOdds().catch(console.error)
