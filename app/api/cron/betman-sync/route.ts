import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/betman-sync
 *
 * Vercel Cron으로 2시간마다 실행.
 * 베트맨 API에서 최신 프로토 승부식 경기를 가져와 DB에 동기화.
 *
 * 흐름:
 * 1. betman API에서 최신 gmTs 조회
 * 2. 게임 데이터 fetch
 * 3. betman_rounds upsert
 * 4. betman_games upsert (100건씩 배치)
 * 5. betman_sync_state 업데이트
 */

const BETMAN_BASE = 'https://www.betman.co.kr'
const GM_ID = 'G101' // 프로토 승부식

const SPORT_MAP: Record<string, string> = {
  SC: '축구', BK: '농구', VL: '배구', BS: '야구',
}
const TYPE_MAP: Record<string, string> = {
  '0': '일반', '2': '핸디캡', '5': 'SUM', '9': '언더오버', '12': '핸디캡', '14': '일반',
}

interface BetmanGame {
  round_id: string
  game_no: number
  match_time: string | null
  sport: string
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  venue: string | null
  status: string
  handicap: number | null
  over_under_line: number | null
  home_win_odds: number | null
  draw_odds: number | null
  away_win_odds: number | null
  over_odds: number | null
  under_odds: number | null
  odd_odds: number | null
  even_odds: number | null
}

async function fetchLatestGmTs(): Promise<string | null> {
  try {
    const resp = await fetch(`${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do`,
      },
      body: JSON.stringify({ _sbmInfo: { _sbmInfo: { debugMode: 'false' } } }),
    })

    if (!resp.ok) return null
    const data = await resp.json()
    const protoGames = data?.protoGames || []
    const g101 = protoGames.find((g: { gmId?: string }) => g.gmId === GM_ID)
    return g101?.gmTs ? String(g101.gmTs) : null
  } catch (e) {
    console.error('[betman-sync] Failed to fetch gmTs:', e)
    return null
  }
}

async function fetchGameData(gmTs: string): Promise<unknown[] | null> {
  try {
    // 쿠키 설정을 위한 첫 요청
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      redirect: 'follow',
    })

    const resp = await fetch(`${BETMAN_BASE}/buyPsblGame/gameInfoInq.do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        gameYear: '',
        _sbmInfo: { _sbmInfo: { debugMode: 'false' } },
      }),
    })

    if (!resp.ok) return null
    const data = await resp.json()
    return data?.compSchedules?.datas || null
  } catch (e) {
    console.error('[betman-sync] Failed to fetch game data:', e)
    return null
  }
}

function parseGames(datas: unknown[], roundId: string): BetmanGame[] {
  return (datas as unknown[][])
    .filter((d) => (d[16] as number || 0) !== 0 || (d[17] as number || 0) !== 0 || (d[18] as number || 0) !== 0)
    .map((d) => {
      const sportCode = (d[0] as string) || ''
      const sport = SPORT_MAP[sportCode] || sportCode || '축구'
      const gameTypeCode = String(d[19] ?? '0')
      const gameType = TYPE_MAP[gameTypeCode] || '일반'
      const matchTimeMs = d[3] as number | null
      const matchTime = matchTimeMs ? new Date(matchTimeMs).toISOString() : null

      const isNormalOrHandicap = gameType === '일반' || gameType === '핸디캡'
      const isUnderOver = gameType === '언더오버'
      const isSum = gameType === 'SUM'

      return {
        round_id: roundId,
        game_no: (d[11] as number) || 0,
        match_time: matchTime,
        sport,
        league_code: (d[7] as string) || '',
        game_type: gameType,
        home_team_name: (d[14] as string) || '',
        away_team_name: (d[15] as string) || '',
        venue: (d[10] as string) || null,
        status: 'scheduled',
        handicap: gameType === '핸디캡' && d[20] ? (d[20] as number) : null,
        over_under_line: isUnderOver && d[20] ? (d[20] as number) : null,
        home_win_odds: isNormalOrHandicap && (d[16] as number) > 0 ? (d[16] as number) : null,
        draw_odds: isNormalOrHandicap && (d[17] as number) > 0 ? (d[17] as number) : null,
        away_win_odds: isNormalOrHandicap && (d[18] as number) > 0 ? (d[18] as number) : null,
        over_odds: isUnderOver && (d[18] as number) > 0 ? (d[18] as number) : null,
        under_odds: isUnderOver && (d[16] as number) > 0 ? (d[16] as number) : null,
        odd_odds: isSum && (d[16] as number) > 0 ? (d[16] as number) : null,
        even_odds: isSum && (d[18] as number) > 0 ? (d[18] as number) : null,
      }
    })
}

export async function GET(request: NextRequest) {
  const start = Date.now()

  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // 1. 최신 gmTs 조회
    const gmTs = await fetchLatestGmTs()
    if (!gmTs) {
      await updateSyncState(supabase, null, 'error', 0, 'betman API에서 gmTs를 가져올 수 없음')
      return NextResponse.json({ error: 'betman API에서 gmTs를 가져올 수 없습니다.' }, { status: 502 })
    }

    console.log(`[betman-sync] gmTs: ${gmTs}`)

    // 2. 게임 데이터 조회
    const rawDatas = await fetchGameData(gmTs)
    if (!rawDatas || rawDatas.length === 0) {
      await updateSyncState(supabase, gmTs, 'checked', 0, null)
      return NextResponse.json({ gmTs, games: 0, message: '게임 데이터 없음' })
    }

    // 3. 라운드 생성/조회
    const year = new Date().getFullYear()
    const roundNum = parseInt(gmTs, 10) || 0

    const { data: existingRound } = await supabase
      .from('betman_rounds')
      .select('id')
      .eq('gm_ts', gmTs)
      .maybeSingle()

    let roundId: string

    if (existingRound) {
      roundId = existingRound.id
      // 라운드가 closed면 reopen
      await supabase
        .from('betman_rounds')
        .update({ status: 'open' })
        .eq('id', roundId)
        .eq('status', 'closed')
    } else {
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + 7)
      deadline.setHours(23, 59, 59, 999)

      const { data: newRound, error: insertError } = await supabase
        .from('betman_rounds')
        .insert({
          gm_ts: gmTs,
          year,
          round: roundNum,
          status: 'open',
          deadline: deadline.toISOString(),
        })
        .select('id')
        .single()

      if (insertError || !newRound) {
        await updateSyncState(supabase, gmTs, 'error', 0, `라운드 생성 실패: ${insertError?.message}`)
        return NextResponse.json({ error: '라운드 생성 실패' }, { status: 500 })
      }
      roundId = newRound.id
    }

    // 4. 게임 파싱
    const games = parseGames(rawDatas, roundId)
    console.log(`[betman-sync] 파싱된 게임: ${games.length}건`)

    // 5. completed/cancelled 게임 제외 (이미 결과가 확정된 경기를 scheduled로 덮어쓰면 안 됨)
    const { data: finishedGames } = await supabase
      .from('betman_games')
      .select('game_no')
      .eq('round_id', roundId)
      .in('status', ['completed', 'cancelled'])

    const finishedGameNos = new Set((finishedGames || []).map((g: { game_no: number }) => g.game_no))
    const newOrScheduledGames = games.filter((g) => !finishedGameNos.has(g.game_no))
    console.log(`[betman-sync] upsert 대상: ${newOrScheduledGames.length}건 (완료/취소 ${finishedGameNos.size}건 제외)`)

    // 6. 배치 upsert (100건씩)
    const BATCH_SIZE = 100
    let upsertedCount = 0
    let errorCount = 0

    for (let i = 0; i < newOrScheduledGames.length; i += BATCH_SIZE) {
      const batch = newOrScheduledGames.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('betman_games')
        .upsert(batch, { onConflict: 'round_id,game_no', ignoreDuplicates: false })

      if (error) {
        console.error(`[betman-sync] Batch ${i} upsert error:`, error)
        errorCount++
      } else {
        upsertedCount += batch.length
      }
    }

    // 7. sync_state 업데이트
    const action = existingRound ? 'updated' : 'created'
    await updateSyncState(supabase, gmTs, action, upsertedCount, errorCount > 0 ? `${errorCount} batch errors` : null)

    const duration = Date.now() - start
    console.log(`[betman-sync] 완료: ${upsertedCount}건, ${duration}ms`)

    return NextResponse.json({
      gmTs,
      roundId,
      action,
      games: upsertedCount,
      errors: errorCount,
      duration: `${duration}ms`,
    })
  } catch (error) {
    console.error('[betman-sync] Unexpected error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// Vercel cron은 GET만 호출하므로 POST도 지원
export async function POST(request: NextRequest) {
  return GET(request)
}

async function updateSyncState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string | null,
  action: string,
  gamesCount: number,
  lastError: string | null,
) {
  try {
    const { data: existing } = await supabase
      .from('betman_sync_state')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const updateData: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_sync_action: action,
      last_sync_games_count: gamesCount,
      last_error: lastError,
    }
    if (gmTs) updateData.latest_gm_ts = gmTs

    if (existing) {
      await supabase.from('betman_sync_state').update(updateData).eq('id', existing.id)
    } else {
      await supabase.from('betman_sync_state').insert(updateData)
    }
  } catch (e) {
    console.error('[betman-sync] Failed to update sync state:', e)
  }
}
