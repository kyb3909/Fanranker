import type { SupabaseClient } from "@supabase/supabase-js"
import { marketSignature, physicalMatchKey, type CurrentMarketRow } from "./market-dedup"

export interface MarketScopeRow {
  id: string
  round_id: string | null
  game_no: number
  sport: string
  league_code: string | null
  home_team_name: string
  away_team_name: string
  match_time: string
  game_type: string
  handicap: number | null
  over_under_line: number | null
}

/** Until ingestion preserves period explicitly, use the existing UI rules everywhere.
 * Must receive the complete match market group, including SUM and other statuses/types.
 * Isolate rounds: a later listing of a full-time market is not a half-time market.
 */
export function getExcludedMarketIds(rows: MarketScopeRow[]): Set<string> {
  const excluded = new Set<string>()
  const groups = new Map<string, MarketScopeRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([
      row.round_id,
      row.sport,
      row.league_code,
      row.home_team_name,
      row.away_team_name,
      row.match_time,
    ])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    let afterSum = false
    const seen = new Set<string>()
    const signatures = new Map<string, boolean>()
    for (const row of [...group].sort((a, b) => a.game_no - b.game_no)) {
      const isSum = row.game_type === "SUM" || row.game_type === "SSUM"
      const explicitHalf = row.game_type.startsWith("S") && !isSum
      const key = JSON.stringify([row.game_type, row.handicap, row.over_under_line])
      const signature = marketSignature(row)
      const duplicateHalf = seen.has(key) && (signatures.get(signature) ?? true)
      const hidden = isSum || explicitHalf || afterSum || duplicateHalf
      if (hidden) excluded.add(row.id)
      signatures.set(signature, hidden)
      seen.add(key)
      if (isSum) afterSum = true
    }
  }
  return excluded
}

/** Selected IDs alone cannot distinguish unprefixed half-time rows. Read their context.
 * Paginate so the SUM boundary cannot disappear at a PostgREST response limit.
 * Throw on failure: neither accept predictions nor produce findings from partial context.
 */
export async function loadMarketScopeRows(
  supabase: SupabaseClient,
  targets: MarketScopeRow[]
): Promise<MarketScopeRow[]> {
  if (!targets.length) return []
  const rounds = [...new Set(targets.map((g) => g.round_id).filter((id): id is string => !!id))]
  if (rounds.length === 0 || targets.some((g) => !g.round_id))
    throw new Error("Market round missing")
  const times = targets.map((g) => g.match_time).sort()
  const rows: MarketScopeRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("betman_games")
      .select(
        "id, round_id, game_no, sport, league_code, home_team_name, away_team_name, match_time, game_type, handicap, over_under_line, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds"
      )
      .in("round_id", rounds)
      .gte("match_time", times[0])
      .lte("match_time", times[times.length - 1])
      .order("id")
      .range(offset, offset + 499)
    if (error || !data) throw new Error("Failed to load market scope")
    rows.push(...(data as MarketScopeRow[]))
    if (data.length < 500) break
  }
  if (targets.some((g) => !rows.some((row) => row.id === g.id)))
    throw new Error("Incomplete market scope")
  return rows
}

export type PredictionMarketRow = MarketScopeRow &
  CurrentMarketRow & {
    status: string
    daily_round_id: string | null
    home_win_odds: number | null
    away_win_odds: number | null
    draw_odds: number | null
    over_odds: number | null
    under_odds: number | null
  }

/** New submissions need all listings of the selected physical matches, including
 * newer rounds and non-scheduled/SUM rows. Settlement keeps its round-local loader.
 */
export async function loadPredictionMarketRows(
  supabase: SupabaseClient,
  targets: MarketScopeRow[]
): Promise<PredictionMarketRow[]> {
  if (!targets.length) return []
  const times = [...new Set(targets.map((game) => game.match_time))]
  const sports = [...new Set(targets.map((game) => game.sport))]
  const matchKeys = new Set(targets.map(physicalMatchKey))
  const rows: PredictionMarketRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("betman_games")
      .select(
        "id, round_id, game_no, daily_round_id, sport, league_code, home_team_name, away_team_name, match_time, game_type, handicap, over_under_line, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, market_round:betman_rounds!betman_games_round_id_fkey(gm_ts, year, round)"
      )
      .in("match_time", times)
      .in("sport", sports)
      .order("id")
      .range(offset, offset + 499)
    if (error || !data) throw new Error("Failed to load prediction market scope")
    rows.push(
      ...(data as unknown as PredictionMarketRow[]).filter((game) =>
        matchKeys.has(physicalMatchKey(game))
      )
    )
    if (data.length < 500) break
  }
  if (targets.some((target) => !rows.some((game) => game.id === target.id)))
    throw new Error("Incomplete prediction market scope")
  return rows
}
