import "server-only"
import { getLfaLineup } from "@/lib/lfa/lineups"
import { resolveLfaMatch } from "@/lib/lfa/match"
import { getMatchByGameId } from "@/lib/match/get-match"
import { loadStoredLineup, storeLfaLineup } from "@/lib/match/lineup-store"
import type { LineupResponse } from "@/lib/match/lineup-types"

/** First paint is always DB-only, including previously acquired legacy snapshots. */
export async function getStoredMatchLineup(gameId: string): Promise<LineupResponse | null> {
  return loadStoredLineup(gameId).catch(() => null)
}

/** All matches use paid LFA; never depend on Soccerway mapping/availability. */
export async function getMatchLineup(gameId: string): Promise<LineupResponse> {
  const stored = await getStoredMatchLineup(gameId)
  // Once confirmed, the roster is the record. No remapping, squad or lineup purchase
  // on revisits, even when a historical roster has no bench or its schedule vanished.
  if (stored?.status === "ready" && stored.projected === false) return stored
  if (stored?.status === "ready" && Date.now() - Date.parse(stored.fetchedAt) < 120_000)
    return stored
  const match = await getMatchByGameId(gameId).catch(() => null)
  if (!match) return stored ?? { status: "none" }
  const pending: LineupResponse = { status: "pending", kickoff: match.matchTime }

  // Bound purchases for arbitrary historical URLs. Existing LFA snapshots remain readable.
  const elapsed = Date.now() - Date.parse(match.matchTime)
  if (!Number.isFinite(elapsed) || elapsed < -150 * 60_000 || elapsed > 48 * 3600_000)
    return stored ?? pending
  const matchId =
    match.source === "lfa"
      ? match.lfaMatchId
      : (await resolveLfaMatch({ ...match, gameId: match.gameId }).catch(() => null))?.id
  if (!matchId) return stored ?? pending
  const lu = await getLfaLineup(matchId, match.homeTeam, match.awayTeam).catch(() => null)
  if (!lu) return stored ?? pending
  if (lu.home.starters.length !== 11 || lu.away.starters.length !== 11) return stored ?? pending
  const payload: LineupResponse = {
    status: "ready",
    source: "lfa",
    matchId,
    projected: lu.projected,
    kickoff: match.matchTime,
    fetchedAt: new Date().toISOString(),
    home: { teamLabel: match.homeTeam, ...lu.home },
    away: { teamLabel: match.awayTeam, ...lu.away },
  }
  await storeLfaLineup(gameId, matchId, payload).catch(() => {})
  return payload
}
