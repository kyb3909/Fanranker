/** Isolated PostgreSQL execution; no env, network, or production connection.
 * PGlite is single-connection: transaction semantics are tested, multi-session load is not.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "../output/lfa-snapshot-test/node_modules/@electric-sql/pglite/dist/index.js"

const db = new PGlite()
const market = "00000000-0000-0000-0000-000000000001"
const sibling = "00000000-0000-0000-0000-000000000002"
const fixture = "00000000-0000-0000-0000-000000000003"
const other = "00000000-0000-0000-0000-000000000004"
let passed = 0
async function check(name, fn) {
  await db.exec(
    "truncate polls, posts, match_lineups, match_details_cache, lfa_fixtures, betman_games"
  )
  await db.query(
    `insert into betman_games values ($1,'EPL','Home','Away',now(),'축구'),($2,'EPL','Home','Away',now(),'축구')`,
    [market, sibling]
  )
  await db.query("insert into lfa_fixtures values ($1,'provider',null)", [fixture])
  await db.query("insert into match_lineups values ($1,'provider',$2)", [
    fixture,
    { source: "lfa", matchId: "provider", status: "ready", projected: false },
  ])
  await fn()
  passed++
  console.log(`PASS ${name}`)
}
async function thread(id = fixture, provider = "provider") {
  return (
    await db.query("select ensure_lfa_match_thread($1,$2,'bot','title','{}') as result", [
      provider,
      id,
    ])
  ).rows[0].result
}
async function poll(id = fixture, key = "lfa_provider") {
  const options = Array.from({ length: 22 }, (_, i) => ({ key: `p${i}`, label: `Player ${i}` }))
  return (
    await db.query(
      "select ensure_lfa_motm_poll('provider',$1,$2,'Who?',$3,now()+interval '1 day') as result",
      [id, key, options]
    )
  ).rows[0].result
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table betman_games(id uuid primary key,league_code text,home_team_name text,away_team_name text,match_time timestamptz,sport text);
    create table lfa_fixtures(id uuid primary key,lfa_match_id text unique,betman_game_id uuid unique);
    create table match_details_cache(game_id text primary key,lfa_match_id text);
    create table match_lineups(game_id text primary key,event_id text,payload jsonb);
    create table posts(id uuid primary key default gen_random_uuid(),user_id text,community_slug text,title text,content jsonb,match_game_id uuid unique,created_at timestamptz default now());
    create table polls(id uuid primary key default gen_random_uuid(),question text,options jsonb,is_active boolean,allow_reason boolean,created_by text,kind text,match_key text unique,game_id text,closes_at timestamptz,created_at timestamptz default now());
  `)
  const sql = await readFile(
    new URL("../supabase/migrations/20260910_match_artifact_creation.sql", import.meta.url),
    "utf8"
  )
  await db.exec(sql)
  await check("late Betman link reuses LFA thread and poll across sibling IDs", async () => {
    const a = await thread()
    const p = await poll()
    await db.query("update lfa_fixtures set betman_game_id=$1 where id=$2", [market, fixture])
    assert.deepEqual(await thread(sibling), { id: a.id, created: false })
    assert.deepEqual(await poll(market, "old-betman-key"), { id: p.id, created: false })
    assert.equal((await db.query("select count(*)::int as n from posts")).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int as n from polls")).rows[0].n, 1)
  })
  await check("legacy Betman artifacts survive even before explicit fixture link", async () => {
    await db.query("insert into match_lineups values ($1,'provider',$2)", [
      market,
      { source: "lfa", matchId: "provider", status: "ready" },
    ])
    const a = await thread(market)
    const p = await poll(market, "betman-key")
    assert.deepEqual(await thread(fixture), { id: a.id, created: false })
    assert.deepEqual(await poll(fixture), { id: p.id, created: false })
  })
  await check("request cannot attach unrelated game or provider", async () => {
    await assert.rejects(thread(other), /unproven LFA identity/)
    await assert.rejects(thread(fixture, "wrong-provider"), /unproven LFA identity/)
  })
  await check("predicted and legacy provider lineups do not authorize new creation", async () => {
    await db.exec(`update match_lineups set payload = payload || '{"projected":true}'`)
    await assert.rejects(thread(), /confirmed LFA lineup required/)
    await assert.rejects(poll(), /confirmed LFA lineup required/)
    await db.exec("update match_lineups set payload = payload - 'projected'")
    await assert.rejects(thread(), /confirmed LFA lineup required/)
    await assert.rejects(poll(), /confirmed LFA lineup required/)
    await db.exec(`update match_lineups set payload = '{"status":"ready"}'`)
    await assert.rejects(thread(), /confirmed LFA lineup required/)
  })
  await check("conflicting persisted identity prevents creation", async () => {
    await db.query("update lfa_fixtures set betman_game_id=$1", [market])
    await db.query("insert into match_details_cache values ($1,'different-provider')", [sibling])
    await assert.rejects(thread(), /conflicting LFA identity/)
    await assert.rejects(poll(), /conflicting LFA identity/)
  })
  await check("ordinary roles cannot call creation functions", async () => {
    const { rows } =
      await db.query(`select has_function_privilege('anon','ensure_lfa_match_thread(text,uuid,text,text,jsonb)','EXECUTE') as anon,
      has_function_privilege('authenticated','ensure_lfa_motm_poll(text,uuid,text,text,jsonb,timestamptz)','EXECUTE') as auth,
      has_function_privilege('service_role','ensure_lfa_match_thread(text,uuid,text,text,jsonb)','EXECUTE') as service`)
    assert.deepEqual(rows[0], { anon: false, auth: false, service: true })
  })
  console.log(`${passed} SQL artifact checks passed`)
} finally {
  await db.close()
}
