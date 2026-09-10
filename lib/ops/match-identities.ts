import type { SupabaseClient } from "@supabase/supabase-js"
import { matchKeyOf } from "@/lib/match/match-key"

interface BetmanRow {
  id: string
  home_team_name: string
  away_team_name: string
  match_time: string
  league_code: string | null
  status: string
  home_score: number | null
  away_score: number | null
}

interface SupplementalRow {
  id: string
  betman_game_id: string | null
  lfa_match_id: string
  match_time: string
  fixture: {
    homeTeam: string
    awayTeam: string
    leagueCode: string
    status: string
    homeScore: number | null
    awayScore: number | null
  }
}

export interface AuditMatchGroup {
  key: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  leagueCode: string | null
  ids: string[]
  betmanIds: string[]
  lfaMatchIds: string[]
  pollKeys: string[]
  status: string
  score: { homeScore: number | null; awayScore: number | null }
  supplemental: SupplementalRow[]
}

const BETMAN_COLUMNS =
  "id, home_team_name, away_team_name, match_time, league_code, status, home_score, away_score"
const LFA_COLUMNS = "id, betman_game_id, lfa_match_id, match_time, fixture"
const CHUNK = 100
const PAGE = 500

/** Read-only scans must fail explicitly; a missing page is not evidence of missing work. */
export async function readAuditRows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  if (data == null) throw new Error(`${label}: 조회 결과 없음`)
  return data
}

export async function readAuditPages<T>(
  label: string,
  page: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const batch = await readAuditRows(label, page(from, from + PAGE - 1))
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

export async function readAuditByIds<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  field: string,
  values: string[]
): Promise<T[]> {
  const ids = [...new Set(values)]
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = await readAuditPages<T>(
      `${table}.${field}`,
      (from, to) =>
        db
          .from(table)
          .select(columns)
          .in(field, ids.slice(i, i + CHUNK))
          .order(field)
          .range(from, to) as unknown as PromiseLike<{
          data: T[] | null
          error: { message: string } | null
        }>
    )
    rows.push(...batch)
  }
  return rows
}

/** Join only persisted links, never infer identity from similar teams or nearby kickoff times. */
export function groupAuditMatches(
  games: BetmanRow[],
  supplemental: SupplementalRow[]
): AuditMatchGroup[] {
  const groups = new Map<string, AuditMatchGroup>()
  const byId = new Map<string, AuditMatchGroup>()
  for (const g of games) {
    const parts = {
      homeTeam: g.home_team_name,
      awayTeam: g.away_team_name,
      matchTime: g.match_time,
    }
    const key = matchKeyOf(parts)
    const groupKey = `${g.league_code}|${key}`
    let group = groups.get(groupKey)
    if (!group) {
      group = {
        ...parts,
        key,
        leagueCode: g.league_code,
        ids: [],
        betmanIds: [],
        lfaMatchIds: [],
        pollKeys: [key],
        status: g.status,
        score: { homeScore: g.home_score, awayScore: g.away_score },
        supplemental: [],
      }
      groups.set(groupKey, group)
    }
    if (g.status === "completed" || (group.status === "scheduled" && g.status === "in_progress")) {
      group.status = g.status
    }
    if (group.score.homeScore == null && g.home_score != null) {
      group.score = { homeScore: g.home_score, awayScore: g.away_score }
    }
    group.ids.push(g.id)
    group.betmanIds.push(g.id)
    byId.set(g.id, group)
  }
  for (const s of supplemental) {
    const group =
      (s.betman_game_id && byId.get(s.betman_game_id)) ||
      ({
        key: `lfa_${s.lfa_match_id}`,
        homeTeam: s.fixture.homeTeam,
        awayTeam: s.fixture.awayTeam,
        matchTime: s.match_time,
        leagueCode: s.fixture.leagueCode,
        ids: [],
        betmanIds: [],
        lfaMatchIds: [],
        pollKeys: [],
        status: s.fixture.status,
        score: { homeScore: null, awayScore: null },
        supplemental: [],
      } satisfies AuditMatchGroup)
    if (!group.ids.includes(s.id)) {
      group.ids.push(s.id)
      group.lfaMatchIds.push(s.lfa_match_id)
      group.pollKeys.push(`lfa_${s.lfa_match_id}`)
      group.supplemental.push(s)
    }
    if (!s.betman_game_id || !byId.has(s.betman_game_id)) groups.set(`lfa:${s.id}`, group)
  }
  return [...groups.values()].sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}

async function includeLinkedBetman(
  db: SupabaseClient,
  games: BetmanRow[],
  saved: SupplementalRow[]
) {
  const have = new Set(games.map((g) => g.id))
  const missing = saved.flatMap((s) =>
    s.betman_game_id && !have.has(s.betman_game_id) ? [s.betman_game_id] : []
  )
  const anchors = await readAuditByIds<BetmanRow>(db, "betman_games", BETMAN_COLUMNS, "id", missing)
  const rows = new Map([...games, ...anchors].map((g) => [g.id, g]))
  const scanned = new Set<string>()
  // An LFA row may be inside the window while ALL its Betman markets are outside it.
  // Load the anchor's siblings too, otherwise artifacts under another market still disappear.
  for (const anchor of anchors) {
    const key = JSON.stringify([
      anchor.league_code,
      anchor.home_team_name,
      anchor.away_team_name,
      anchor.match_time,
    ])
    if (scanned.has(key)) continue
    scanned.add(key)
    const siblings = await readAuditPages<BetmanRow>("betman_games.siblings", (from, to) =>
      db
        .from("betman_games")
        .select(BETMAN_COLUMNS)
        .eq("sport", "축구")
        .eq("league_code", anchor.league_code)
        .eq("home_team_name", anchor.home_team_name)
        .eq("away_team_name", anchor.away_team_name)
        .eq("match_time", anchor.match_time)
        .order("id")
        .range(from, to)
    )
    for (const sibling of siblings) rows.set(sibling.id, sibling)
  }
  return [...rows.values()]
}

export async function loadAuditMatchGroups(db: SupabaseClient, from: string, to: string) {
  const [games, inWindow] = await Promise.all([
    readAuditPages<BetmanRow>("betman_games", (start, end) =>
      db
        .from("betman_games")
        .select(BETMAN_COLUMNS)
        .eq("sport", "축구")
        .gte("match_time", from)
        .lt("match_time", to)
        .order("id")
        .range(start, end)
    ),
    readAuditPages<SupplementalRow>("lfa_fixtures", (start, end) =>
      db
        .from("lfa_fixtures")
        .select(LFA_COLUMNS)
        .gte("match_time", from)
        .lt("match_time", to)
        .order("id")
        .range(start, end)
    ),
  ])
  // A kickoff change can move the LFA row outside the scan window; the saved link still applies.
  const linked = await readAuditByIds<SupplementalRow>(
    db,
    "lfa_fixtures",
    LFA_COLUMNS,
    "betman_game_id",
    games.map((g) => g.id)
  )
  const saved = [...new Map([...inWindow, ...linked].map((s) => [s.id, s])).values()]
  return groupAuditMatches(await includeLinkedBetman(db, games, saved), saved)
}

/** Canonical metadata for stored report/detail IDs, including LFA UUIDs. */
export async function loadAuditGamesByIds(db: SupabaseClient, ids: string[]) {
  const [games, saved] = await Promise.all([
    readAuditByIds<BetmanRow>(db, "betman_games", BETMAN_COLUMNS, "id", ids),
    readAuditByIds<SupplementalRow>(db, "lfa_fixtures", LFA_COLUMNS, "id", ids),
  ])
  const groups = groupAuditMatches(await includeLinkedBetman(db, games, saved), saved)
  return groups.flatMap((g) =>
    g.ids.map((id) => ({
      id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      matchTime: g.matchTime,
    }))
  )
}
