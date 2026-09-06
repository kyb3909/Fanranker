import type { SupabaseClient } from "@supabase/supabase-js"
import type { BetmanGameRow, TeamDictionaryRow } from "./match-mapping"

const PAGE_SIZE = 200
const ID_BATCH_SIZE = 100

export interface MappingAttemptRow {
  id: string
  game_id: string
  input_hash: string
  status: string
  attempt: number
  outcome: string
  created_at: string
}

// Keyset pagination: the limit bounds each DB response, never the candidate universe.
export async function loadMappingGames(db: SupabaseClient, now: number, lookbackHours: number) {
  const rows: BetmanGameRow[] = []
  let after: string | undefined
  for (;;) {
    let query = db
      .from("betman_games")
      .select("id, home_team_name, away_team_name, match_time, league_code")
      .eq("sport", "축구")
      .gte("match_time", new Date(now - lookbackHours * 3600_000).toISOString())
      .lte("match_time", new Date(now + 8 * 86400_000).toISOString())
      .order("id")
      .limit(PAGE_SIZE)
    if (after) query = query.gt("id", after)
    const { data, error } = await query
    if (error) throw new Error(`betman_games 조회 실패: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data?.length || data.length < PAGE_SIZE) return rows
    after = data[data.length - 1].id
  }
}

export async function loadMappingDictionary(db: SupabaseClient) {
  const rows: TeamDictionaryRow[] = []
  let after: string | undefined
  for (;;) {
    let query = db
      .from("team_dictionary")
      .select("soccerway_team_id, slug, name_en, name_kr, aliases_kr, status")
      .order("soccerway_team_id")
      .limit(PAGE_SIZE)
    if (after) query = query.gt("soccerway_team_id", after)
    const { data, error } = await query
    if (error) throw new Error(`team_dictionary 조회 실패: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data?.length || data.length < PAGE_SIZE) return rows
    after = data[data.length - 1].soccerway_team_id
  }
}

export async function loadMappingAttempts(db: SupabaseClient, ids: string[], version: string) {
  const rows: MappingAttemptRow[] = []
  // Bound the URL as well as the response; one match can have many historical attempts.
  for (let offset = 0; offset < ids.length; offset += ID_BATCH_SIZE) {
    let after: string | undefined
    for (;;) {
      let query = db
        .from("match_mapping_attempts")
        .select("id, game_id, input_hash, status, attempt, outcome, created_at")
        .in("game_id", ids.slice(offset, offset + ID_BATCH_SIZE))
        .eq("predicate_version", version)
        .order("id")
        .limit(PAGE_SIZE)
      if (after) query = query.gt("id", after)
      const { data, error } = await query
      if (error) throw new Error(`attempts 조회 실패: ${error.message}`)
      rows.push(...(data ?? []))
      if (!data?.length || data.length < PAGE_SIZE) break
      after = data[data.length - 1].id
    }
  }
  return rows
}

export function groupMappingGames(rows: BetmanGameRow[]): BetmanGameRow[][] {
  const groups = new Map<string, BetmanGameRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([
      row.league_code,
      row.home_team_name,
      row.away_team_name,
      new Date(row.match_time).toISOString(),
    ])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => group.sort((a, b) => a.id.localeCompare(b.id)))
}
