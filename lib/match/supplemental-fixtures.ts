import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import type { LfaFixture } from "@/lib/lfa/fixtures"
import { isPopularFixture } from "@/lib/match/popular-teams"
import { isMatchPageLeague } from "@/lib/match/leagues"

export interface SupplementalFixture {
  id: string
  lfa_match_id: string
  fixture: LfaFixture
  match_time: string
  betman_game_id: string | null
}

const COLUMNS = "id, lfa_match_id, fixture, match_time, betman_game_id"

/** DB-only lookup; never buys a feed for an arbitrary URL. */
export async function getSupplementalFixture(id: string): Promise<SupplementalFixture | null> {
  const { data, error } = await createServiceRoleClient()
    .from("lfa_fixtures")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`lfa-fixture-read:${error.code}`)
  return data as SupplementalFixture | null
}

export async function findSupplementalForBetmanIds(
  ids: string[]
): Promise<SupplementalFixture | null> {
  if (!ids.length) return null
  const { data, error } = await createServiceRoleClient()
    .from("lfa_fixtures")
    .select(COLUMNS)
    .in("betman_game_id", ids)
  if (error) throw new Error(`lfa-fixture-link-read:${error.code}`)
  if ((data?.length ?? 0) > 1) throw new Error("lfa-fixture-link-ambiguous")
  return (data?.[0] as SupplementalFixture | undefined) ?? null
}

export async function listSupplementalFixtures(
  start: string,
  end: string
): Promise<SupplementalFixture[]> {
  const { data, error } = await createServiceRoleClient()
    .from("lfa_fixtures")
    .select(COLUMNS)
    .gte("match_time", start)
    .lt("match_time", end)
  if (error) throw new Error(`lfa-fixture-list:${error.code}`)
  return (data ?? []) as SupplementalFixture[]
}

/** Caller has already matched the complete slot. Only missing popular fixtures are inserted.
 * Upserting by provider ID preserves the DB UUID on retries and concurrent sweeps.
 * A later Betman listing attaches to that UUID; it never replaces the match identity.
 */
export async function syncSupplementalFixtures(
  fixtures: LfaFixture[],
  linked: Map<string, string>,
  missingIds: Set<string>
): Promise<Map<string, SupplementalFixture>> {
  const db = createServiceRoleClient()
  if (!fixtures.length) return new Map()
  const { data, error } = await db
    .from("lfa_fixtures")
    .select(COLUMNS)
    .in(
      "lfa_match_id",
      fixtures.map((f) => f.lfaId)
    )
  if (error) throw new Error(`lfa-fixture-list:${error.code}`)
  const existing = new Map(((data as SupplementalFixture[]) ?? []).map((r) => [r.lfa_match_id, r]))
  const rows = fixtures
    .filter(
      (f) =>
        existing.has(f.lfaId) ||
        (missingIds.has(f.lfaId) && isPopularFixture(f) && isMatchPageLeague(f.leagueCode))
    )
    .map((f) => ({
      lfa_match_id: f.lfaId,
      fixture: f,
      match_time: f.matchTime,
      // Omit absent links: a concurrent/unmatched scan must not erase an established association.
      ...(linked.has(f.lfaId) ? { betman_game_id: linked.get(f.lfaId) } : {}),
      updated_at: new Date().toISOString(),
    }))
  // Separate payload shapes so PostgREST does not fill omitted link columns with NULL.
  for (const hasLink of [false, true]) {
    const batch = rows.filter((r) => (r.betman_game_id !== undefined) === hasLink)
    if (!batch.length) continue
    const { data: saved, error: saveError } = await db
      .from("lfa_fixtures")
      .upsert(batch, { onConflict: "lfa_match_id", defaultToNull: false })
      .select(COLUMNS)
    if (saveError) throw new Error(`lfa-fixture-save:${saveError.code}`)
    for (const row of (saved ?? []) as SupplementalFixture[]) existing.set(row.lfa_match_id, row)
  }
  return existing
}

export function supplementalSummary(row: SupplementalFixture) {
  const f = row.fixture
  return {
    ...f,
    gameId: row.id,
    matchKey: `lfa_${row.lfa_match_id}`,
    lfaMatchId: row.lfa_match_id,
    source: "lfa" as const,
    betmanGameId: row.betman_game_id,
    lfaFinished: f.status === "completed",
    venue: null,
  }
}
