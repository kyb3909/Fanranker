import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { getMatchIdentity } from "@/lib/match/sibling-ids"
import { getSupplementalFixture } from "@/lib/match/supplemental-fixtures"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import { isLfaFinishedStatus } from "@/lib/lfa/status"
import { FRESH_LIVE_MS } from "@/lib/lfa/day-freshness"
import type { LfaMatchDetails } from "@/lib/lfa/client"
// match.ts uses this recovery path at runtime; these imports must remain type-only.
import type { BetmanGameKey, LfaMatchInfo } from "@/lib/lfa/match"

type DetailSnapshot = { details: LfaMatchDetails; updatedAt: number }
type StoredGame = {
  id: string
  home_team_name: string
  away_team_name: string
  league_code: string
  match_time: string
}

/** A failed day feed must not force already identified live matches to freeze.
 * This path never guesses an identity or stamps an old score as freshly received.
 */
export async function recoverKnownMatchDetails(
  game: BetmanGameKey,
  previous: LfaMatchInfo | undefined,
  fetchDetails: (id: string, live: boolean, retryEmpty: boolean) => Promise<DetailSnapshot>
): Promise<{ info: LfaMatchInfo; details: LfaMatchDetails }> {
  const now = Date.now()
  const kickoff = Date.parse(game.matchTime)
  if (
    !lfaLeagueId(game.leagueCode) ||
    !Number.isFinite(kickoff) ||
    now < kickoff ||
    now - kickoff > 4 * 3600_000
  ) {
    throw new Error("lfa-detail-fallback-outside-live-window")
  }

  const db = createServiceRoleClient()
  const identity = await getMatchIdentity(db, game.gameId, { strict: true })
  const matchId = identity.lfaMatchId
  if (!matchId || (previous?.matchId && previous.matchId !== matchId)) {
    throw new Error("lfa-detail-fallback-identity-missing-or-conflicting")
  }
  const { data, error } = await db
    .from("betman_games")
    .select("id,home_team_name,away_team_name,league_code,match_time")
    .in("id", identity.gameIds)
  if (error || !data) throw new Error("lfa-detail-fallback-games-unavailable")
  const games = data as StoredGame[]
  // A shared provider ID must not silently join two different saved match groups.
  if (
    games.some(
      (row) =>
        row.home_team_name !== game.homeTeam ||
        row.away_team_name !== game.awayTeam ||
        row.league_code !== game.leagueCode ||
        Date.parse(row.match_time) !== kickoff
    )
  ) {
    throw new Error("lfa-detail-fallback-game-conflict")
  }
  if (!games.some((row) => row.id === game.gameId)) {
    const fixture = await getSupplementalFixture(game.gameId)
    if (
      !fixture ||
      fixture.lfa_match_id !== matchId ||
      fixture.fixture.homeTeam !== game.homeTeam ||
      fixture.fixture.awayTeam !== game.awayTeam ||
      fixture.fixture.leagueCode !== game.leagueCode ||
      Date.parse(fixture.match_time) !== kickoff
    ) {
      throw new Error("lfa-detail-fallback-fixture-conflict")
    }
  }

  const snapshot = await fetchDetails(matchId, true, true)
  const details = snapshot.details
  if (details.match_id !== matchId) throw new Error("lfa-detail-fallback-response-identity")
  const score = (value: unknown): number | null => {
    if (typeof value !== "string" && typeof value !== "number") return null
    if (typeof value === "string" && !value.trim()) return null
    const number = Number(value)
    return Number.isSafeInteger(number) && number >= 0 ? number : null
  }
  const homeScore = score(details.header?.home?.score)
  const awayScore = score(details.header?.away?.score)
  const status = details.header?.status
  const finished = isLfaFinishedStatus(status)
  const live = status?.is_live === true
  if (
    homeScore === null ||
    awayScore === null ||
    (!finished && !live) ||
    !Array.isArray(details.events) ||
    !Array.isArray(details.stats) ||
    !Number.isFinite(snapshot.updatedAt) ||
    Date.now() - snapshot.updatedAt > FRESH_LIVE_MS
  ) {
    throw new Error("lfa-detail-fallback-incomplete-response")
  }
  return {
    details,
    info: {
      matchId,
      // Current score/status/stats/events all come from this newly fetched detail.
      sourceUpdatedAt: snapshot.updatedAt,
      detailsUpdatedAt: snapshot.updatedAt,
      // Keep the last day-feed watermark; no day payload was refreshed here.
      ...(previous?.dayUpdatedAt != null ? { dayUpdatedAt: previous.dayUpdatedAt } : {}),
      finished,
      live,
      minute: live ? status?.minute?.trim() || null : null,
      homeScore,
      awayScore,
      // Historical halftime values are retained, not claimed as a new observation.
      htHome: previous?.htHome ?? null,
      htAway: previous?.htAway ?? null,
      stats: [],
      timeline: [],
    },
  }
}
