import "server-only"
import { getLfaLineup } from "@/lib/lfa/lineups"
import { resolveLfaMatch } from "@/lib/lfa/match"
import { readMatchDetails } from "@/lib/lfa/persist"
import { getMatchByGameId } from "@/lib/match/get-match"
import { loadStoredLfaLineup, storeLfaLineup } from "@/lib/match/lineup-store"
import type { LineupResponse } from "@/lib/match/lineup-types"

/** First paint is DB-only. Legacy/unknown-source snapshots are not claimed as LFA lineups. */
export async function getStoredMatchLineup(gameId: string): Promise<LineupResponse | null> {
  const stored = await loadStoredLfaLineup(gameId).catch(() => null)
  if (stored) return stored
  // Older LFA rows predate source metadata. Verify their event ID against DB-only LFA
  // details, so historical lineups remain readable without buying or trusting Soccerway.
  const details = await readMatchDetails(gameId).catch(() => null)
  return details?.info.matchId
    ? loadStoredLfaLineup(gameId, details.info.matchId).catch(() => null)
    : null
}

/** All matches use paid LFA; never depend on Soccerway mapping/availability. */
export async function getMatchLineup(gameId: string): Promise<LineupResponse> {
  const match = await getMatchByGameId(gameId).catch(() => null)
  if (!match) return { status: "none" }
  const pending: LineupResponse = { status: "pending", kickoff: match.matchTime }
  const stored = await getStoredMatchLineup(gameId)
  const complete = (p: LineupResponse | null) =>
    p?.status === "ready" &&
    p.home.starters.length === 11 &&
    p.away.starters.length === 11 &&
    p.home.bench.length > 0 &&
    p.away.bench.length > 0
  if (complete(stored)) return stored!

  // Bound purchases for arbitrary historical URLs. Existing LFA snapshots remain readable.
  const elapsed = Date.now() - Date.parse(match.matchTime)
  if (!Number.isFinite(elapsed) || elapsed < -150 * 60_000 || elapsed > 48 * 3600_000)
    return stored ?? pending
  const matchId =
    match.source === "lfa"
      ? match.lfaMatchId
      : (await resolveLfaMatch({ ...match, gameId: match.gameId }).catch(() => null))?.id
  if (!matchId) return stored ?? pending
  const trusted = stored ?? (await loadStoredLfaLineup(gameId, matchId).catch(() => null))
  if (complete(trusted)) return trusted!
  const lu = await getLfaLineup(matchId, match.homeTeam, match.awayTeam).catch(() => null)
  if (!lu || (lu.projected && trusted?.status === "ready")) return trusted ?? pending
  if (lu.home.starters.length !== 11 || lu.away.starters.length !== 11) return trusted ?? pending
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
  if (!lu.projected) await storeLfaLineup(gameId, matchId, payload).catch(() => {})
  return payload
}
