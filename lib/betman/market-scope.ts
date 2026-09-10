import type { SupabaseClient } from "@supabase/supabase-js"
import { marketSignature } from "./market-dedup"

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
