import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchAndApplyResults } from "../app/api/cron/betman-sync/route"
import { settlePredictions } from "../lib/betman/settle"

type MissingGameRow = {
  round_id: string | null
  match_time: string | null
}

type RoundRow = {
  id: string
  gm_ts: string | number | null
}

type ScoreCandidate = {
  id: string
  game_type: string
  status: string
  result: string | null
  home_score: number | null
  away_score: number | null
  handicap: number | null
  over_under_line: number | null
}

const GAME_SELECT =
  "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function deriveResultFromScore(
  homeScore: number,
  awayScore: number,
  gameType: string,
  handicap: number | null,
  overUnderLine: number | null
): string {
  if (gameType === "핸디캡" || gameType === "S핸디캡") {
    const adjusted = homeScore + (handicap ?? 0)
    if (adjusted > awayScore) return "home"
    if (adjusted < awayScore) return "away"
    return "draw"
  }

  if (gameType === "언더오버" || gameType === "S언더오버") {
    const line = overUnderLine ?? 0
    if (line === 0) return ""
    const total = homeScore + awayScore
    if (total > line) return "over"
    if (total < line) return "under"
    return ""
  }

  if (gameType === "SUM") {
    const total = homeScore + awayScore
    return total % 2 === 0 ? "even" : "odd"
  }

  if (homeScore > awayScore) return "home"
  if (homeScore < awayScore) return "away"
  return "draw"
}

async function countMissingPastGames(supabase: ReturnType<typeof createServiceClient>) {
  const nowIso = new Date().toISOString()
  const { count, error } = await supabase
    .from("betman_games")
    .select("*", { head: true, count: "exact" })
    .lt("match_time", nowIso)
    .in("status", ["scheduled", "in_progress", "completed"])
    .or("result.is.null,result.eq.")

  if (error) throw error
  return count ?? 0
}

async function listPendingRoundGmTs(
  supabase: ReturnType<typeof createServiceClient>,
  limit = 30,
  days = 60
): Promise<string[]> {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - days)

  const { data: missingGames, error: missingError } = await supabase
    .from("betman_games")
    .select("round_id, match_time")
    .not("round_id", "is", null)
    .lt("match_time", now.toISOString())
    .gte("match_time", from.toISOString())
    .in("status", ["scheduled", "in_progress", "completed"])
    .or("result.is.null,result.eq.")
    .order("match_time", { ascending: false })
    .limit(Math.max(limit * 60, 300))

  if (missingError) throw missingError
  const rows = (missingGames || []) as MissingGameRow[]
  if (rows.length === 0) return []

  const missingByRound = new Map<string, number>()
  for (const row of rows) {
    if (!row.round_id) continue
    missingByRound.set(row.round_id, (missingByRound.get(row.round_id) || 0) + 1)
  }

  const roundIds = Array.from(missingByRound.keys())
  if (roundIds.length === 0) return []

  const { data: rounds, error: roundsError } = await supabase
    .from("betman_rounds")
    .select("id, gm_ts")
    .in("id", roundIds)

  if (roundsError) throw roundsError

  const ranked = ((rounds || []) as RoundRow[])
    .filter((r) => !!r.gm_ts)
    .map((r) => ({
      gmTs: String(r.gm_ts),
      missingGames: missingByRound.get(r.id) || 0,
    }))
    .sort((a, b) => {
      if (b.missingGames !== a.missingGames) return b.missingGames - a.missingGames
      return Number(b.gmTs) - Number(a.gmTs)
    })
    .slice(0, limit)

  return ranked.map((r) => r.gmTs)
}

async function crawlMissingRounds(
  supabase: ReturnType<typeof createServiceClient>,
  gmTsList: string[]
) {
  let updated = 0
  let cancelled = 0
  const errors: string[] = []

  for (const gmTs of gmTsList) {
    try {
      const result = await fetchAndApplyResults(supabase as never, gmTs)
      updated += result.updated
      cancelled += result.cancelled
      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `[${gmTs}] ${e}`))
      }
      console.log(
        `[crawl] gmTs=${gmTs} updated=${result.updated} cancelled=${result.cancelled} errors=${result.errors.length}`
      )
    } catch (e) {
      const msg = `[${gmTs}] ${(e as Error).message}`
      errors.push(msg)
      console.error("[crawl] error:", msg)
    }
  }

  return { updated, cancelled, errors }
}

async function backfillByExistingScores(supabase: ReturnType<typeof createServiceClient>) {
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from("betman_games")
    .select("id, game_type, status, result, home_score, away_score, handicap, over_under_line")
    .lt("match_time", nowIso)
    .in("status", ["scheduled", "in_progress", "completed"])
    .or("result.is.null,result.eq.")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(5000)

  if (error) throw error

  const candidates = (data || []) as ScoreCandidate[]
  let updated = 0
  let unresolved = 0
  const errors: string[] = []

  for (const g of candidates) {
    if (g.home_score === null || g.away_score === null) continue

    const finalResult = deriveResultFromScore(
      g.home_score,
      g.away_score,
      g.game_type,
      g.handicap,
      g.over_under_line
    )

    if (!finalResult) {
      unresolved++
      continue
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("betman_games")
      .update({
        result: finalResult,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", g.id)
      .in("status", ["scheduled", "in_progress", "completed"])
      .select("id")

    if (updateError) {
      errors.push(`game=${g.id}: ${updateError.message}`)
    } else if (updatedRows && updatedRows.length > 0) {
      updated++
    }
  }

  return { candidates: candidates.length, updated, unresolved, errors }
}

async function settleAllPendingAvailable(supabase: ReturnType<typeof createServiceClient>) {
  const pendingPredictions: Array<{
    id: string
    user_id: string
    game_id: string
    prediction: string
    status: string
    stake: number | null
    slip_id: string | null
    locked_odds: number | null
  }> = []

  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id, locked_odds")
      .eq("status", "pending")
      .range(from, from + pageSize - 1)

    if (error) throw error
    const rows = data || []
    pendingPredictions.push(...rows)

    if (rows.length < pageSize) break
    from += pageSize
  }

  if (pendingPredictions.length === 0) {
    return {
      pendingPredictions: 0,
      settleableGames: 0,
      settled: 0,
      correct: 0,
      wrong: 0,
      cancelled: 0,
      errors: [] as string[],
    }
  }

  const gameIds = Array.from(new Set(pendingPredictions.map((p) => p.game_id).filter(Boolean)))
  const games: Array<Record<string, unknown>> = []

  const chunkSize = 200
  for (let i = 0; i < gameIds.length; i += chunkSize) {
    const chunk = gameIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from("betman_games")
      .select(GAME_SELECT)
      .in("id", chunk)
      .in("status", ["completed", "cancelled"])

    if (error) throw error
    games.push(...(data || []))
  }

  const settleableGames = games.filter(
    (g) => g.status === "cancelled" || (!!g.result && g.result !== "")
  )

  if (settleableGames.length === 0) {
    return {
      pendingPredictions: pendingPredictions.length,
      settleableGames: 0,
      settled: 0,
      correct: 0,
      wrong: 0,
      cancelled: 0,
      errors: [] as string[],
    }
  }

  const settleableGameIds = new Set(settleableGames.map((g) => String(g.id)))
  const targetPreds = pendingPredictions.filter((p) => settleableGameIds.has(p.game_id))

  if (targetPreds.length === 0) {
    return {
      pendingPredictions: pendingPredictions.length,
      settleableGames: settleableGames.length,
      settled: 0,
      correct: 0,
      wrong: 0,
      cancelled: 0,
      errors: [] as string[],
    }
  }

  const settleResult = await settlePredictions(
    supabase as never,
    settleableGames as never,
    targetPreds as never
  )

  return {
    pendingPredictions: pendingPredictions.length,
    settleableGames: settleableGames.length,
    settled: settleResult.settled,
    correct: settleResult.correct,
    wrong: settleResult.wrong,
    cancelled: settleResult.cancelled,
    errors: settleResult.errors,
  }
}

function getNumericOption(name: string, fallback: number): number {
  const argvKey = `--${name}=`
  const fromArg = process.argv.find((a) => a.startsWith(argvKey))
  const raw = fromArg
    ? fromArg.slice(argvKey.length)
    : process.env[`BACKFILL_${name.toUpperCase()}`]
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function main() {
  const supabase = createServiceClient()

  const beforeMissing = await countMissingPastGames(supabase)
  console.log(`[start] missing past games: ${beforeMissing}`)

  const roundLimit = getNumericOption("limit", 30)
  const days = getNumericOption("days", 60)

  const targetGmTs = await listPendingRoundGmTs(supabase, roundLimit, days)
  console.log(`[crawl] scan-window: days=${days}, round-limit=${roundLimit}`)
  console.log(`[crawl] target rounds: ${targetGmTs.length > 0 ? targetGmTs.join(", ") : "(none)"}`)

  const crawlResult = await crawlMissingRounds(supabase, targetGmTs)

  const scoreBackfill = await backfillByExistingScores(supabase)

  const settleResult = await settleAllPendingAvailable(supabase)

  const afterMissing = await countMissingPastGames(supabase)

  const summary = {
    beforeMissing,
    afterMissing,
    crawl: {
      rounds: targetGmTs.length,
      updated: crawlResult.updated,
      cancelled: crawlResult.cancelled,
      errors: crawlResult.errors.length,
    },
    scoreBackfill,
    settle: settleResult,
  }

  console.log("[done]", JSON.stringify(summary, null, 2))

  if (crawlResult.errors.length > 0) {
    console.log("[crawl-errors-sample]", crawlResult.errors.slice(0, 20))
  }

  if (scoreBackfill.errors.length > 0) {
    console.log("[backfill-errors-sample]", scoreBackfill.errors.slice(0, 20))
  }

  if (settleResult.errors.length > 0) {
    console.log("[settle-errors-sample]", settleResult.errors.slice(0, 20))
  }
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})
