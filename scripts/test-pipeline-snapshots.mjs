/** Isolated SQL regressions. No environment variables, network, or production DB. */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "../output/lfa-snapshot-test/node_modules/@electric-sql/pglite/dist/index.js"

const db = new PGlite()
const stamp = (n) => new Date(Date.parse("2026-09-10T12:00:00Z") + n * 60_000).toISOString()
const fixture = (n, extra = {}) => ({ lfaId: "f1", matchTime: stamp(60),
  sourceUpdatedAt: Date.parse(stamp(n)), status: "scheduled", homeScore: null, awayScore: null, ...extra })
const lineup = (n, extra = {}) => ({ status: "ready", source: "lfa", matchId: "f1", projected: false,
  fetchedAt: stamp(n + 1), observation: { requestedAt: stamp(n) }, home: { starters: [] }, away: { starters: [] }, ...extra })
const pollId = "00000000-0000-4000-8000-000000000001"
let passed = 0
const result = async (sql, args) => (await db.query(sql, args)).rows[0].result
const saveFixture = (n, extra) => result("select write_lfa_fixture_snapshot($1) result", [fixture(n, extra)])
const saveLineup = (n, extra, ids = ["b", "a"]) => result("select write_lfa_lineup_snapshot($1, 'f1', $2) result", [ids, lineup(n, extra)])
const append = (keys) => result("select append_motm_options($1, $2) result", [pollId, keys.map(key => ({ key, label: key }))])
async function check(name, fn) {
  await db.exec("truncate lfa_fixtures, match_lineups, polls")
  await fn()
  console.log(`PASS ${name}`)
  passed++
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table lfa_fixtures(id uuid primary key default gen_random_uuid(), lfa_match_id text unique,
      fixture jsonb not null, match_time timestamptz, betman_game_id uuid unique,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table match_lineups(game_id text primary key, event_id text not null, payload jsonb not null,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table polls(id uuid primary key, kind text, options jsonb, is_active boolean, closes_at timestamptz);`)
  await db.exec(await readFile(new URL("../supabase/migrations/20260910_pipeline_snapshot_guards.sql", import.meta.url), "utf8"))

  await check("fixture: slow pregame response cannot erase completed score", async () => {
    const saved = await saveFixture(10, { status: "completed", homeScore: 2, awayScore: 1 })
    assert.deepEqual(await saveFixture(0), saved)
    assert.deepEqual(await saveFixture(20), saved)
  })
  await check("fixture: newer correction may lower score and move kickoff without changing ID/link", async () => {
    const saved = await saveFixture(10, { status: "completed", homeScore: 2, awayScore: 1 })
    await db.query("update lfa_fixtures set betman_game_id = $1, updated_at = now() where id = $2", [pollId, saved.id])
    const next = await saveFixture(11, { status: "completed", homeScore: 1, awayScore: 1, matchTime: stamp(75) })
    assert.equal(next.id, saved.id)
    assert.equal(next.betman_game_id, pollId)
    assert.equal(next.fixture.homeScore, 1)
    assert.equal(next.fixture.matchTime, stamp(75))
  })
  await check("fixture: source time missing is rejected", async () => {
    await assert.rejects(saveFixture(0, { sourceUpdatedAt: null }), /invalid fixture snapshot/)
  })
  await check("lineup: request start wins over late response delivery", async () => {
    const saved = await saveLineup(10)
    const old = await saveLineup(0, { fetchedAt: stamp(20) })
    assert.equal(old.written, false)
    assert.deepEqual(old.payload, saved.payload)
  })
  await check("lineup: confirmed never becomes predicted, newer confirmed correction is accepted", async () => {
    await saveLineup(10)
    assert.equal((await saveLineup(20, { projected: true })).written, false)
    assert.equal((await saveLineup(21, { home: { starters: [{ id: "corrected" }] } })).written, true)
    assert.equal((await db.query("select count(*) n from match_lineups")).rows[0].n, 1)
  })
  await check("lineup: overlapping callers keep one established storage row", async () => {
    await saveLineup(10, {}, ["z"])
    await saveLineup(11, {}, ["a", "z"])
    assert.deepEqual((await db.query("select game_id from match_lineups")).rows, [{ game_id: "z" }])
  })
  await check("lineup: conflicting provider identity is rejected", async () => {
    await saveLineup(10)
    await db.exec("update match_lineups set event_id = 'other'")
    await assert.rejects(saveLineup(20), /identity conflict/)
  })
  await check("lineup: label-only correction keeps original source time and remains writable", async () => {
    await saveLineup(10)
    await db.exec(`update match_lineups set payload = jsonb_set(payload, '{home,label}', '"한글"'::jsonb)`)
    const old = await saveLineup(0)
    assert.equal(old.payload.home.label, "한글")
  })
  const openPoll = async () => db.query("insert into polls values($1, 'motm', $2, true, now() + interval '1 hour')", [pollId, [{ key: "a", label: "original" }]])
  await check("motm: stale writers add to DB-current options and never replace an existing key", async () => {
    await openPoll()
    assert.equal((await append(["b"])).added, 1)
    assert.equal((await append(["a", "c", "c"])).added, 1)
    const final = await append(["a", "b", "c"])
    assert.equal(final.added, 0)
    assert.deepEqual(final.options.map(o => o.key), ["a", "b", "c"])
    assert.equal(final.options[0].label, "original")
  })
  await check("motm: closed polls are unchanged and invalid keys roll back", async () => {
    await openPoll()
    await assert.rejects(result("select append_motm_options($1, $2) result", [pollId, [{ key: "b" }, { label: "bad" }]]), /invalid motm option key/)
    await db.exec("update polls set closes_at = now() - interval '1 minute'")
    const final = await append(["c"])
    assert.equal(final.added, 0)
    assert.equal(final.options.length, 1)
  })
  await check("RPCs remain service-role only", async () => {
    const rows = await db.query(`select has_function_privilege('anon', 'append_motm_options(uuid,jsonb)', 'execute') a,
      has_function_privilege('authenticated', 'write_lfa_fixture_snapshot(jsonb)', 'execute') b,
      has_function_privilege('service_role', 'write_lfa_lineup_snapshot(text[],text,jsonb)', 'execute') c`)
    assert.deepEqual(rows.rows[0], { a: false, b: false, c: true })
  })
  console.log(`${passed} SQL checks passed. PGlite does not replace multi-session concurrency testing.`)
} finally { await db.close() }
