/** Round-local period classification still needs the odds signature below.
 * Cross-round selection must use market identity, never price equality.
 */

interface MarketRowLike {
  game_type?: unknown
  handicap?: unknown
  over_under_line?: unknown
  home_win_odds?: unknown
  away_win_odds?: unknown
  draw_odds?: unknown
  over_odds?: unknown
  under_odds?: unknown
  odd_odds?: unknown
  even_odds?: unknown
}

export function marketSignature(g: MarketRowLike): string {
  const v = (x: unknown) => (x === null || x === undefined ? "x" : String(x))
  return [
    v(g.game_type),
    v(g.handicap),
    v(g.over_under_line),
    v(g.home_win_odds),
    v(g.away_win_odds),
    v(g.draw_odds),
    v(g.over_odds),
    v(g.under_odds),
    v(g.odd_odds),
    v(g.even_odds),
  ].join("|")
}

export interface MatchIdentityRow {
  sport: string
  league_code: string | null
  home_team_name: string
  away_team_name: string
  match_time: string
}

interface MarketRound {
  gm_ts: string | null
  year: number
  round: number
}

export interface CurrentMarketRow extends MatchIdentityRow, MarketRowLike {
  id: string
  round_id: string | null
  game_no: number
  market_round: MarketRound | MarketRound[] | null
}

export class MarketRoundError extends Error {}

export function physicalMatchKey(game: MatchIdentityRow): string {
  const kickoff = Date.parse(game.match_time)
  return JSON.stringify([
    game.sport,
    game.league_code,
    game.home_team_name,
    game.away_team_name,
    Number.isFinite(kickoff) ? kickoff : game.match_time,
  ])
}

/** Call only after period classification; full-time and half-time are not interchangeable. */
export function fullTimeMarketKey(game: MatchIdentityRow & MarketRowLike): string {
  return JSON.stringify([
    physicalMatchKey(game),
    game.game_type,
    game.handicap ?? null,
    game.over_under_line ?? null,
  ])
}

function roundOrder(game: CurrentMarketRow): number {
  // PostgREST to-one embeds are objects; clients without generated relationships
  // also infer arrays. Accept only a single unambiguous round in either shape.
  const metadata = game.market_round
  if (Array.isArray(metadata) && metadata.length !== 1)
    throw new MarketRoundError("Ambiguous market round metadata")
  const round = Array.isArray(metadata) ? metadata[0] : metadata
  if (!game.round_id || !round || !Number.isInteger(round.year) || round.year < 2000)
    throw new MarketRoundError("Market round metadata unavailable")
  // gm_ts is YY + four-digit round number. Legacy rows can use year/round instead.
  if (round.gm_ts != null) {
    if (
      !/^\d{6}$/.test(round.gm_ts) ||
      Number(round.gm_ts.slice(0, 2)) !== round.year % 100 ||
      Number(round.gm_ts.slice(2)) < 1
    )
      throw new MarketRoundError("Invalid market round sequence")
    return round.year * 10000 + Number(round.gm_ts.slice(2))
  }
  const sequence = round.round >= 10000 ? round.round % 10000 : round.round
  if (
    !Number.isInteger(round.round) ||
    sequence < 1 ||
    (round.round >= 10000 && Math.floor(round.round / 10000) !== round.year % 100)
  )
    throw new MarketRoundError("Invalid legacy market round sequence")
  return round.year * 10000 + sequence
}

/** Select the newest listing before applying status/odds filters. Never revive an
 * older scheduled row when the newest listing is cancelled or has zero odds.
 * Input must already exclude unsupported periods using the complete round context.
 */
export function dedupeMarketRows<T extends CurrentMarketRow>(games: T[]): T[] {
  const latest = new Map<string, { game: T; order: number }>()
  for (const g of games) {
    const key = fullTimeMarketKey(g)
    const order = roundOrder(g)
    const previous = latest.get(key)
    if (previous && order === previous.order && g.round_id !== previous.game.round_id)
      throw new MarketRoundError("Ambiguous market round sequence")
    if (
      !previous ||
      order > previous.order ||
      (order === previous.order &&
        (g.game_no < previous.game.game_no ||
          (g.game_no === previous.game.game_no && g.id < previous.game.id)))
    )
      latest.set(key, { game: g, order })
  }
  return [...latest.values()].map(({ game }) => game)
}
