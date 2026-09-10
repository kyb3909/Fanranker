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
  const eligible: LfaFixture[] = []
  for (const f of fixtures) {
    if (!existing.has(f.lfaId)) {
      if (!missingIds.has(f.lfaId) || !isPopularFixture(f) || !isMatchPageLeague(f.leagueCode)) {
        continue
      }
      // Recheck the DB outside the day cache before creating a new identity.
      // Match slotKey's minute precision; team aliases must not bypass this guard.
      const start = Math.floor(new Date(f.matchTime).getTime() / 60_000) * 60_000
      const { data: betman, error: betmanError } = await db
        .from("betman_games")
        .select("id")
        .eq("sport", "축구")
        .eq("league_code", f.leagueCode)
        .gte("match_time", new Date(start).toISOString())
        .lt("match_time", new Date(start + 60_000).toISOString())
        .limit(1)
      if (betmanError) {
        throw new Error(
          `lfa-fixture-betman-check:${f.lfaId}:${betmanError.code}:${betmanError.message}`
        )
      }
      if (betman?.length) {
        console.warn("[fixtures] LFA 신규 등록 보류: DB에 베트맨 슬롯 존재", {
          lfaId: f.lfaId,
          leagueCode: f.leagueCode,
          matchTime: f.matchTime,
        })
        continue
      }
    }
    eligible.push(f)
  }
  for (const fixture of eligible) {
    // Historical DB snapshots without provenance remain readable, but cannot be
    // republished as a fresh provider response by recovery or a page visit.
    if (!Number.isFinite(fixture.sourceUpdatedAt) || fixture.sourceUpdatedAt! <= 0) continue
    const { data: saved, error: saveError } = await db.rpc("write_lfa_fixture_snapshot", {
      p_fixture: fixture as never,
    })
    if (saveError) throw new Error(`lfa-fixture-save:${saveError.code}`)
    if (!saved) throw new Error("lfa-fixture-save:empty")
    const row = saved as unknown as SupplementalFixture
    existing.set(row.lfa_match_id, row)
  }
  // A repeated/concurrent scan can fill an empty link, but never move an established identity.
  for (const [lfaId, betmanId] of linked) {
    const current = existing.get(lfaId)
    if (!current || current.betman_game_id) continue
    const { data: attached, error: attachError } = await db
      .from("lfa_fixtures")
      .update({ betman_game_id: betmanId, updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .is("betman_game_id", null)
      .select(COLUMNS)
    if (attachError) throw new Error(`lfa-fixture-attach:${attachError.code}`)
    if (attached?.[0]) existing.set(lfaId, attached[0] as SupplementalFixture)
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
