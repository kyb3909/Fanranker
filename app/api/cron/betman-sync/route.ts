import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { deriveResultFromScore, mapGameResult, parseScore } from "@/lib/betman/result-mapper"

/**
 * GET /api/cron/betman-sync
 *
 * Vercel Cron Watchdog + Round Maintenance
 *
 * betman.co.kr은 한국 IP에서만 접근 가능하므로 Vercel에서 직접 스크래핑하지 않음.
 * 대신 아래 역할을 수행:
 *
 * 1. 동기화 staleness 감시 → VPS에 urgent resync 신호
 * 2. 라운드 생명주기 관리 (auto-close, status 정리)
 * 3. 새 회차 감지를 위한 DB 기반 프로빙 요청 플래그
 * 4. 동기화 상태 헬스체크 및 로깅
 */

const STALE_THRESHOLD_HOURS = 3
const URGENT_THRESHOLD_HOURS = 6

const BETMAN_BASE = "https://www.betman.co.kr"
const GM_ID = "G101"

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BETMAN_BASE,
}

const SPORT_MAP: Record<string, string> = {
  SC: "축구",
  BK: "농구",
  VL: "배구",
  BS: "야구",
}
const TYPE_MAP: Record<string, string> = {
  "0": "일반",
  "2": "핸디캡",
  "5": "SUM",
  "9": "언더오버",
  "12": "핸디캡",
  "14": "일반",
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

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
      })
      if (resp.ok) return resp
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }
      lastError = new Error(`HTTP ${resp.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError || new Error("fetch failed after retries")
}

async function fetchAllGmTs(): Promise<string[]> {
  try {
    const resp = await fetchWithRetry(`${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do`,
      },
      body: JSON.stringify({ _sbmInfo: { _sbmInfo: { debugMode: "false" } } }),
    })
    const data = await resp.json()
    const protoGames = data?.protoGames || []
    const gmTsList: string[] = []
    for (const g of protoGames) {
      if (g.gmId === GM_ID && g.gmTs) {
        gmTsList.push(String(g.gmTs))
      }
    }
    return gmTsList
  } catch {
    return []
  }
}

async function fetchGameData(gmTs: string): Promise<unknown[] | null> {
  try {
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "follow",
    }).catch(() => {})

    const resp = await fetchWithRetry(`${BETMAN_BASE}/buyPsblGame/gameInfoInq.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        gameYear: "",
        _sbmInfo: { _sbmInfo: { debugMode: "false" } },
      }),
    })
    const data = await resp.json()
    return data?.compSchedules?.datas || null
  } catch {
    return null
  }
}

function parseGames(datas: unknown[], roundId: string): BetmanGame[] {
  return (datas as unknown[][])
    .filter(
      (d) =>
        ((d[16] as number) || 0) !== 0 ||
        ((d[17] as number) || 0) !== 0 ||
        ((d[18] as number) || 0) !== 0
    )
    .map((d) => {
      const sportCode = (d[0] as string) || ""
      const sport = SPORT_MAP[sportCode] || sportCode || "축구"
      const gameTypeCode = String(d[19] ?? "0")
      const gameType = TYPE_MAP[gameTypeCode] || "일반"
      const matchTimeMs = d[3] as number | null
      const matchTime = matchTimeMs ? new Date(matchTimeMs).toISOString() : null

      const isNormalOrHandicap = gameType === "일반" || gameType === "핸디캡"
      const isUnderOver = gameType === "언더오버"
      const isSum = gameType === "SUM"

      return {
        round_id: roundId,
        game_no: (d[11] as number) || 0,
        match_time: matchTime,
        sport,
        league_code: (d[7] as string) || "",
        game_type: gameType,
        home_team_name: (d[14] as string) || "",
        away_team_name: (d[15] as string) || "",
        venue: (d[10] as string) || null,
        status: "scheduled",
        handicap: gameType === "핸디캡" && d[20] ? (d[20] as number) : null,
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

// --- 경기 결과 가져오기 (직접 HTTP, Playwright 불필요) ---

const RESULT_HANDI_MAP: Record<number, string> = {
  0: "일반",
  2: "핸디캡",
  5: "SUM",
  6: "S핸디캡",
  7: "S언더오버",
  9: "언더오버",
  14: "일반",
}

interface ResultItem {
  GAME_RESULT: string
  GM_SEQ: number
  MCH_SCORE: string
  HANDI_VAL: number
  HOME_TEAM: string
  AWAY_TEAM: string
  FIX_MCH_DTM?: string
}

function buildMatchKey(item: Pick<ResultItem, "HOME_TEAM" | "AWAY_TEAM" | "FIX_MCH_DTM">): string {
  const base = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}`
  return item.FIX_MCH_DTM ? `${base}|${item.FIX_MCH_DTM}` : base
}

async function fetchResultData(gmTs: string): Promise<ResultItem[] | null> {
  try {
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "follow",
    }).catch(() => {})

    const resp = await fetchWithRetry(`${BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        _sbmInfo: { _sbmInfo: { debugMode: "false" } },
      }),
    })

    const data = await resp.json()
    const items = data?.detlBody
    if (!Array.isArray(items) || items.length === 0) return null
    return items as ResultItem[]
  } catch {
    return null
  }
}

export async function fetchAndApplyResults(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string
): Promise<{ updated: number; cancelled: number; errors: string[] }> {
  const resultData = await fetchResultData(gmTs)
  if (!resultData) return { updated: 0, cancelled: 0, errors: [] }

  const { data: round } = await supabase
    .from("betman_rounds")
    .select("id")
    .eq("gm_ts", gmTs)
    .maybeSingle()

  if (!round) return { updated: 0, cancelled: 0, errors: [`no round for gmTs=${gmTs}`] }

  const actualScoreMap = new Map<string, { home: number; away: number }>()
  for (const item of resultData) {
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    if (gameType === "일반") {
      const score = parseScore(item.MCH_SCORE)
      if (score) {
        actualScoreMap.set(buildMatchKey(item), score)
      }
    }
  }

  // 게임별 handicap/over_under_line 조회 (스코어 기반 결과 추론에 필요)
  const { data: gamesWithConditions } = await supabase
    .from("betman_games")
    .select("game_no, game_type, handicap, over_under_line")
    .eq("round_id", round.id)

  const gameConditionMap = new Map((gamesWithConditions || []).map((g) => [g.game_no, g]))

  const results: Array<{
    game_no: number
    home_score: number | null
    away_score: number | null
    result: string
    status: string
  }> = []

  for (const item of resultData) {
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    let mapped = mapGameResult(item.GAME_RESULT, gameType)

    let homeScore: number | null = null
    let awayScore: number | null = null

    if (gameType === "일반") {
      const score = parseScore(item.MCH_SCORE)
      if (score) {
        homeScore = score.home
        awayScore = score.away
      }
    } else {
      const key = buildMatchKey(item)
      const actual = actualScoreMap.get(key)
      if (actual) {
        homeScore = actual.home
        awayScore = actual.away
      } else {
        const fallback = parseScore(item.MCH_SCORE)
        if (fallback) {
          homeScore = fallback.home
          awayScore = fallback.away
        }
      }
    }

    // GAME_RESULT 매핑이 실패한 경우, 스코어 기반으로 결과 추론
    if (
      mapped.result === "" &&
      mapped.status === "completed" &&
      homeScore !== null &&
      awayScore !== null
    ) {
      const cond = gameConditionMap.get(item.GM_SEQ)
      const derived = deriveResultFromScore(
        homeScore,
        awayScore,
        cond?.game_type || gameType,
        cond?.handicap ?? null,
        cond?.over_under_line ?? null
      )
      if (derived) {
        mapped = { result: derived, status: "completed" }
      }
    }

    if (mapped.result === "" && mapped.status === "completed") continue

    results.push({
      game_no: item.GM_SEQ,
      home_score: homeScore,
      away_score: awayScore,
      result: mapped.result,
      status: mapped.status,
    })
  }

  let updated = 0
  let cancelled = 0
  const errors: string[] = []

  for (const r of results) {
    const updateData: Record<string, unknown> = {
      status: r.status,
      updated_at: new Date().toISOString(),
    }
    if (r.home_score !== null) updateData.home_score = r.home_score
    if (r.away_score !== null) updateData.away_score = r.away_score
    if (r.result) updateData.result = r.result

    const { data: updatedRows, error } = await supabase
      .from("betman_games")
      .update(updateData)
      .eq("round_id", round.id)
      .eq("game_no", r.game_no)
      .in("status", ["scheduled", "in_progress", "completed"])
      .select("id")

    if (error) {
      errors.push(`game_no=${r.game_no}: ${error.message}`)
    } else if (updatedRows && updatedRows.length > 0) {
      if (r.status === "cancelled") cancelled++
      else updated++
    }
  }

  return { updated, cancelled, errors }
}

// --- 단일 gmTs에 대한 동기화 로직 (재사용 가능) ---
export async function syncSingleGmTs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string
): Promise<{ action: string; roundId: string; games: number; errors: number } | { error: string }> {
  const rawDatas = await fetchGameData(gmTs)
  if (!rawDatas || rawDatas.length === 0) {
    return { action: "checked", roundId: "", games: 0, errors: 0 }
  }

  const year = new Date().getFullYear()
  const roundNum = parseInt(gmTs, 10) || 0

  const { data: existingRound } = await supabase
    .from("betman_rounds")
    .select("id")
    .eq("gm_ts", gmTs)
    .maybeSingle()

  let roundId: string
  let isNew = false

  if (existingRound) {
    roundId = existingRound.id
    await supabase
      .from("betman_rounds")
      .update({ status: "open" })
      .eq("id", roundId)
      .eq("status", "closed")
  } else {
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 7)
    deadline.setHours(23, 59, 59, 999)

    const { data: newRound, error: insertError } = await supabase
      .from("betman_rounds")
      .insert({
        gm_ts: gmTs,
        year,
        round: roundNum,
        status: "open",
        deadline: deadline.toISOString(),
      })
      .select("id")
      .single()

    if (insertError || !newRound) {
      return { error: `라운드 생성 실패 (${gmTs}): ${insertError?.message}` }
    }
    roundId = newRound.id
    isNew = true
  }

  const games = parseGames(rawDatas, roundId)

  const { data: finishedGames } = await supabase
    .from("betman_games")
    .select("game_no")
    .eq("round_id", roundId)
    .in("status", ["completed", "cancelled"])

  const finishedGameNos = new Set((finishedGames || []).map((g: { game_no: number }) => g.game_no))
  const newOrScheduledGames = games.filter((g) => !finishedGameNos.has(g.game_no))

  const BATCH_SIZE = 100
  let upsertedCount = 0
  let errorCount = 0

  for (let i = 0; i < newOrScheduledGames.length; i += BATCH_SIZE) {
    const batch = newOrScheduledGames.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from("betman_games")
      .upsert(batch, { onConflict: "round_id,game_no", ignoreDuplicates: false })

    if (error) {
      console.error(`[betman-sync] Batch upsert error (gmTs=${gmTs}):`, error)
      errorCount++
    } else {
      upsertedCount += batch.length
    }
  }

  return {
    action: isNew ? "created" : "updated",
    roundId,
    games: upsertedCount,
    errors: errorCount,
  }
}

export async function GET(request: NextRequest) {
  const start = Date.now()

  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const actions: string[] = []

    // ============================================
    // Phase 1: 동기화 상태 점검 (Staleness Check)
    // ============================================
    const { data: syncState } = await supabase
      .from("betman_sync_state")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date()
    let isStale = false
    let isUrgent = false
    let hoursSinceSync = 0

    if (syncState?.last_checked_at) {
      const lastCheck = new Date(syncState.last_checked_at)
      hoursSinceSync = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60)
      isStale = hoursSinceSync > STALE_THRESHOLD_HOURS
      isUrgent = hoursSinceSync > URGENT_THRESHOLD_HOURS

      if (isStale) {
        actions.push(`stale_detected: ${hoursSinceSync.toFixed(1)}h since last sync`)
      }
    } else {
      isUrgent = true
      actions.push("no_sync_state: first run or missing state")
    }

    // ============================================
    // Phase 2: 라운드 생명주기 관리
    // ============================================

    // 2-pre. 과거 scheduled 게임 자동 정리 → in_progress
    const { count: cleanedCount } = await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: now.toISOString() })
      .eq("status", "scheduled")
      .lt("match_time", now.toISOString())

    if (cleanedCount && cleanedCount > 0) {
      actions.push(`stale_games_cleaned: ${cleanedCount} past-due scheduled → in_progress`)
    }

    // 2a. 모든 게임이 completed인 open 라운드 → closed
    const { data: openRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts, round, status")
      .in("status", ["open"])

    if (openRounds && openRounds.length > 0) {
      for (const round of openRounds) {
        const { data: scheduledGames } = await supabase
          .from("betman_games")
          .select("id")
          .eq("round_id", round.id)
          .eq("status", "scheduled")
          .limit(1)

        if (!scheduledGames || scheduledGames.length === 0) {
          // 남은 scheduled 게임 없음 → closed
          await supabase
            .from("betman_rounds")
            .update({ status: "closed", updated_at: now.toISOString() })
            .eq("id", round.id)
          actions.push(`round_closed: ${round.gm_ts} (no scheduled games left)`)
        }
      }
    }

    // 2b. 마감 기한 지난 open 라운드 → closed
    const { data: expiredRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .eq("status", "open")
      .lt("deadline", now.toISOString())

    if (expiredRounds && expiredRounds.length > 0) {
      for (const round of expiredRounds) {
        await supabase
          .from("betman_rounds")
          .update({ status: "closed", updated_at: now.toISOString() })
          .eq("id", round.id)
        actions.push(`round_expired: ${round.gm_ts}`)
      }
    }

    // ============================================
    // Phase 3: 새 회차 직접 탐색 시도 (Vercel에서 betman 접근 시도)
    // ============================================
    // Vercel이 해외 IP라 실패할 수 있지만, 일부 CDN 엣지에서는 성공할 수도 있음
    let directSyncResults: Array<{
      gmTs: string
      action: string
      roundId: string
      games: number
      errors: number
    }> = []

    // 3a. betman API에서 구매 가능 gmTs 직접 시도
    const gmTsList = await fetchAllGmTs()

    if (gmTsList.length > 0) {
      actions.push(`direct_api_success: found gmTs ${gmTsList.join(", ")}`)

      for (const gmTs of gmTsList) {
        const result = await syncSingleGmTs(supabase, gmTs)
        if (!("error" in result)) {
          directSyncResults.push({ gmTs, ...result })
          if (result.action === "created") {
            actions.push(`new_round_synced: ${gmTs} (${result.games} games)`)
          }
        }
      }
    } else {
      actions.push("direct_api_failed: betman unreachable from Vercel (expected)")

      // 3b. Fallback: DB 기반 프로빙 (+1 ~ +5)
      const latestGmTs = syncState?.latest_gm_ts
      if (latestGmTs) {
        const current = parseInt(latestGmTs, 10)
        if (!isNaN(current)) {
          actions.push(`probing: trying gmTs ${current + 1} to ${current + 5}`)

          for (let i = 1; i <= 5; i++) {
            const candidate = String(current + i)
            const result = await syncSingleGmTs(supabase, candidate)
            if (!("error" in result) && result.games > 0) {
              directSyncResults.push({ gmTs: candidate, ...result })
              actions.push(`probe_success: gmTs ${candidate} (${result.games} games)`)
            }
          }
        }
      }
    }

    // ============================================
    // Phase 3.5: 경기 결과 수집 + 자동 정산
    // ============================================
    let resultsFetched = 0
    let resultsCancelled = 0
    const resultErrors: string[] = []

    // 결과가 없는 게임이 있는 라운드의 gmTs 목록 조회
    const { data: roundsNeedingResults } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .in("status", ["open", "closed"])
      .order("gm_ts", { ascending: false })
      .limit(5)

    if (roundsNeedingResults && roundsNeedingResults.length > 0) {
      for (const round of roundsNeedingResults) {
        // 해당 라운드에 결과 미입력 게임이 있는지 확인
        const { count: pendingCount } = await supabase
          .from("betman_games")
          .select("*", { count: "exact", head: true })
          .eq("round_id", round.id)
          .in("status", ["scheduled", "in_progress"])

        if (!pendingCount || pendingCount === 0) continue

        const { updated, cancelled, errors } = await fetchAndApplyResults(supabase, round.gm_ts)
        if (updated > 0 || cancelled > 0) {
          resultsFetched += updated
          resultsCancelled += cancelled
          actions.push(
            `results_fetched: gmTs=${round.gm_ts} (${updated} updated, ${cancelled} cancelled)`
          )
        }
        resultErrors.push(...errors)
      }
    }

    // 결과가 새로 입력된 게임에 대해 자동 정산 실행
    let autoSettleResult = null
    if (resultsFetched > 0 || resultsCancelled > 0) {
      try {
        const { settlePredictions } = await import("@/lib/betman/settle")

        // 방금 결과가 업데이트된 게임들 조회
        const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
        const { data: recentlyUpdatedGames } = await supabase
          .from("betman_games")
          .select(
            "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
          )
          .in("status", ["completed", "cancelled"])
          .not("result", "is", null)
          .gte("updated_at", fiveMinAgo)

        if (recentlyUpdatedGames && recentlyUpdatedGames.length > 0) {
          const gameIds = recentlyUpdatedGames.map((g) => g.id)
          const { data: predictions } = await supabase
            .from("betman_predictions")
            .select("id, user_id, game_id, prediction, status, slip_id, locked_odds, stake")
            .in("game_id", gameIds)
            .eq("status", "pending")

          if (predictions && predictions.length > 0) {
            autoSettleResult = await settlePredictions(supabase, recentlyUpdatedGames, predictions)
            actions.push(
              `auto_settled: ${autoSettleResult.settled} predictions (${autoSettleResult.correct} correct, ${autoSettleResult.wrong} wrong)`
            )
          }
        }
      } catch (settleErr) {
        actions.push(`auto_settle_error: ${(settleErr as Error).message}`)
      }
    }

    // ============================================
    // Phase 4: VPS에 urgent resync 신호 (DB 플래그)
    // ============================================
    if (isStale && directSyncResults.length === 0) {
      // 직접 동기화도 실패했고 stale함 → VPS에 신호
      const resyncFlag = {
        needs_resync: true,
        requested_at: now.toISOString(),
        reason: isUrgent ? "urgent" : "stale",
        hours_since_sync: hoursSinceSync,
        probe_range_start: syncState?.latest_gm_ts
          ? String(parseInt(syncState.latest_gm_ts, 10) + 1)
          : null,
        probe_range_end: syncState?.latest_gm_ts
          ? String(parseInt(syncState.latest_gm_ts, 10) + 5)
          : null,
      }

      await updateSyncState(supabase, null, "watchdog_alert", 0, JSON.stringify(resyncFlag))
      actions.push(
        `resync_flagged: ${isUrgent ? "URGENT" : "stale"} (${hoursSinceSync.toFixed(1)}h)`
      )
    }

    // ============================================
    // Phase 5: 동기화 상태 업데이트
    // ============================================
    const totalGames = directSyncResults.reduce((sum, r) => sum + r.games, 0)

    if (directSyncResults.length > 0 && totalGames > 0) {
      const latestGmTs = directSyncResults[directSyncResults.length - 1].gmTs
      const activeGmTs = directSyncResults.map((r) => r.gmTs)
      await updateSyncState(supabase, latestGmTs, "watchdog_sync", totalGames, null, activeGmTs)
    } else if (!isStale) {
      // 정상 상태, sync_state만 체크 기록
      await updateSyncState(supabase, null, "watchdog_ok", 0, null)
    }

    const duration = Date.now() - start

    return NextResponse.json({
      mode: "watchdog",
      isStale,
      isUrgent,
      hoursSinceSync: hoursSinceSync.toFixed(1),
      actions,
      directSyncResults,
      totalGames,
      results: {
        fetched: resultsFetched,
        cancelled: resultsCancelled,
        errors: resultErrors.length > 0 ? resultErrors : undefined,
      },
      autoSettle: autoSettleResult
        ? {
            settled: autoSettleResult.settled,
            correct: autoSettleResult.correct,
            wrong: autoSettleResult.wrong,
          }
        : null,
      duration: `${duration}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

async function updateSyncState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string | null,
  action: string,
  gamesCount: number,
  lastError: string | null,
  activeRounds?: string[]
) {
  try {
    const { data: existing } = await supabase
      .from("betman_sync_state")
      .select("id")
      .order("updated_at", { ascending: false })
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
    if (activeRounds) updateData.active_rounds = activeRounds

    if (existing) {
      await supabase.from("betman_sync_state").update(updateData).eq("id", existing.id)
    } else {
      await supabase.from("betman_sync_state").insert(updateData)
    }
  } catch (e) {
    console.error("[betman-watchdog] Failed to update sync state:", e)
  }
}
