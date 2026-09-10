import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PairingGame } from "./pair-fixtures"

async function readPages<T>(
  label: string,
  query: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
) {
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await query(offset)
    if (result.error || !result.data)
      throw new Error(`${label}:${result.error?.message ?? "empty response"}`)
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
}

/** DB context shared by schedules and collectors. Includes competing fixtures, not just the requested one. */
export async function loadPairingContext(db: SupabaseClient, start: string, end: string) {
  const rows = await readPages("pairing-games", (offset) =>
    db
      .from("betman_games")
      .select("id,home_team_name,away_team_name,league_code,match_time")
      .eq("sport", "축구")
      .gte("match_time", start)
      .lt("match_time", end)
      .neq("home_team_name", "미정")
      .neq("away_team_name", "미정")
      .order("id")
      .range(offset, offset + 499)
  )
  const groups = new Map<string, PairingGame>()
  for (const row of rows) {
    if (!row.match_time || !row.home_team_name || !row.away_team_name) continue
    const key = JSON.stringify([
      row.league_code,
      row.home_team_name,
      row.away_team_name,
      Date.parse(row.match_time),
    ])
    const previous = groups.get(key)
    if (previous) previous.gameIds!.push(String(row.id))
    else
      groups.set(key, {
        gameId: String(row.id),
        gameIds: [String(row.id)],
        homeTeam: row.home_team_name,
        awayTeam: row.away_team_name,
        leagueCode: row.league_code,
        matchTime: row.match_time,
      })
  }
  const games = [...groups.values()]
  const ids = games.flatMap((g) => g.gameIds!)
  const savedOwners = new Map<string, string[]>()
  if (!ids.length) return { games, savedOwners }
  const add = (lfaId: unknown, gameId: unknown) => {
    if (!lfaId || !gameId) return
    const group = games.find((g) => g.gameIds!.includes(String(gameId)))
    savedOwners.set(String(lfaId), [
      ...new Set([
        ...(savedOwners.get(String(lfaId)) ?? []),
        ...(group?.gameIds ?? [String(gameId)]),
      ]),
    ])
  }
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    const [links, details, lineups] = await Promise.all([
      readPages("pairing-links", (page) =>
        db
          .from("lfa_fixtures")
          .select("lfa_match_id,betman_game_id")
          .in("betman_game_id", batch)
          .order("id")
          .range(page, page + 499)
      ),
      readPages("pairing-details", (page) =>
        db
          .from("match_details_cache")
          .select("game_id,lfa_match_id")
          .in("game_id", batch)
          .order("game_id")
          .range(page, page + 499)
      ),
      readPages("pairing-lineups", (page) =>
        db
          .from("match_lineups")
          .select("game_id,event_id,payload")
          .in("game_id", batch)
          .order("game_id")
          .range(page, page + 499)
      ),
    ])
    for (const row of links) add(row.lfa_match_id, row.betman_game_id)
    for (const row of details) add(row.lfa_match_id, row.game_id)
    for (const row of lineups) {
      const payload = row.payload as { source?: string; matchId?: string } | null
      if (payload?.source === "lfa") {
        if (payload.matchId && row.event_id && payload.matchId !== row.event_id)
          throw new Error("pairing-lineup-identity-conflict")
        add(payload.matchId || row.event_id, row.game_id)
      }
    }
  }
  return { games, savedOwners }
}
