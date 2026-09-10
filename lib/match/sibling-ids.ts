import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export interface MatchIdentity {
  gameIds: string[]
  lfaMatchId: string | null
  pollKeys: string[]
}

type Game = {
  id: string
  home_team_name: string
  away_team_name: string
  match_time: string
  league_code: string
}
type Supplemental = { id: string; lfa_match_id: string; betman_game_id: string | null }
type Detail = { game_id: string; lfa_match_id: string | null }
type Lineup = { game_id: string; event_id: string; payload: unknown }
const GAME_COLUMNS = "id,home_team_name,away_team_name,match_time,league_code"
const LFA_COLUMNS = "id,lfa_match_id,betman_game_id"

async function rows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const result = await query
  if (result.error || !result.data)
    throw new Error(`${label}:${result.error?.message ?? "empty response"}`)
  return result.data
}

/** DB-only identity, closed in both directions over saved links and verified LFA evidence. */
export async function getMatchIdentity(
  db: SupabaseClient,
  gameId: string,
  opts: { strict?: boolean } = {}
): Promise<MatchIdentity> {
  try {
    const ids = new Set([gameId]),
      seen = new Set<string>(),
      keys = new Set<string>()
    const providerIds = new Set<string>(),
      expandedProviders = new Set<string>(),
      groups = new Set<string>()
    const addSupplemental = (row: Supplemental) => {
      ids.add(row.id)
      if (row.betman_game_id) ids.add(row.betman_game_id)
      providerIds.add(row.lfa_match_id)
    }
    const addDetail = (row: Detail) => {
      ids.add(row.game_id)
      if (row.lfa_match_id) providerIds.add(row.lfa_match_id)
    }
    const addLineup = (row: Lineup) => {
      const payload = row.payload as { source?: string; matchId?: string } | null
      if (payload?.source !== "lfa") return
      if (payload.matchId && row.event_id && payload.matchId !== row.event_id)
        throw new Error("match-identity-lineup-conflict")
      const id = payload.matchId || row.event_id
      if (id) {
        ids.add(row.game_id)
        providerIds.add(String(id))
      }
    }
    while ([...ids].some((id) => !seen.has(id))) {
      const batch = [...ids].filter((id) => !seen.has(id)).slice(0, 100)
      batch.forEach((id) => seen.add(id))
      const [games, supplemental, details, lineups] = await Promise.all([
        rows<Game>(
          "match-identity-games",
          db.from("betman_games").select(GAME_COLUMNS).in("id", batch)
        ),
        rows<Supplemental>(
          "match-identity-links",
          db.from("lfa_fixtures").select(LFA_COLUMNS).in("id", batch)
        ),
        rows<Detail>(
          "match-identity-details",
          db.from("match_details_cache").select("game_id,lfa_match_id").in("game_id", batch)
        ),
        rows<Lineup>(
          "match-identity-lineups",
          db.from("match_lineups").select("game_id,event_id,payload").in("game_id", batch)
        ),
      ])
      supplemental.forEach(addSupplemental)
      details.forEach(addDetail)
      lineups.forEach(addLineup)
      for (const game of games) {
        const group = JSON.stringify([
          game.league_code,
          game.home_team_name,
          game.away_team_name,
          Date.parse(game.match_time),
        ])
        keys.add(`${game.home_team_name}_${game.away_team_name}_${game.match_time}`)
        if (groups.has(group)) continue
        groups.add(group)
        const siblings = await rows<Game>(
          "match-identity-siblings",
          db
            .from("betman_games")
            .select(GAME_COLUMNS)
            .eq("league_code", game.league_code)
            .eq("home_team_name", game.home_team_name)
            .eq("away_team_name", game.away_team_name)
            .eq("match_time", game.match_time)
        )
        if (!siblings.some((row) => row.id === game.id))
          throw new Error("match-identity-siblings-missing")
        for (const row of siblings) ids.add(row.id)
      }
      // Supplemental links can point at any market sibling.
      const linked = await rows<Supplemental>(
        "match-identity-linked",
        db.from("lfa_fixtures").select(LFA_COLUMNS).in("betman_game_id", batch)
      )
      linked.forEach(addSupplemental)
      if (providerIds.size > 1) throw new Error("match-identity-provider-conflict")
      const providerId = [...providerIds][0]
      if (providerId && !expandedProviders.has(providerId)) {
        expandedProviders.add(providerId)
        const [registered, cached, rosters] = await Promise.all([
          rows<Supplemental>(
            "match-identity-provider-links",
            db.from("lfa_fixtures").select(LFA_COLUMNS).eq("lfa_match_id", providerId)
          ),
          rows<Detail>(
            "match-identity-provider-details",
            db
              .from("match_details_cache")
              .select("game_id,lfa_match_id")
              .eq("lfa_match_id", providerId)
          ),
          rows<Lineup>(
            "match-identity-provider-lineups",
            db.from("match_lineups").select("game_id,event_id,payload").eq("event_id", providerId)
          ),
        ])
        registered.forEach(addSupplemental)
        cached.forEach(addDetail)
        rosters.forEach(addLineup)
      }
    }
    if (providerIds.size > 1) throw new Error("match-identity-provider-conflict")
    const lfaMatchId = [...providerIds][0] ?? null
    if (lfaMatchId) keys.add(`lfa_${lfaMatchId}`)
    return { gameIds: [...ids].sort(), lfaMatchId, pollKeys: [...keys].sort() }
  } catch (error) {
    if (opts.strict) throw error
    return { gameIds: [gameId], lfaMatchId: null, pollKeys: [] }
  }
}

/** Compatibility wrapper; artifact readers use the full identity above. */
export async function getSiblingGameIds(
  db: SupabaseClient,
  gameId: string,
  opts: { strict?: boolean } = {}
): Promise<string[]> {
  return (await getMatchIdentity(db, gameId, opts)).gameIds
}
