/**
 * 격리 PostgreSQL SQL 회귀 테스트. 운영 연결/환경 변수 불필요.
 * npm install --prefix output/lfa-snapshot-test --no-package-lock --no-audit --no-fund @electric-sql/pglite
 * node scripts/test-lfa-snapshots.mjs
 * PGlite는 단일 연결이므로 실제 다중 세션 동시성 부하 테스트를 대체하지 않는다.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "../output/lfa-snapshot-test/node_modules/@electric-sql/pglite/dist/index.js"

const db = new PGlite()
let passed = 0
async function check(name, test) {
  await db.exec("truncate public.match_details_cache, public.lfa_day_cache")
  await test()
  passed++
  console.log(`PASS ${name}`)
}
const stamp = (offset) => new Date(Date.parse("2026-09-07T00:00:00Z") + offset).toISOString()
const payload = (offset, extras = {}) => ({
  matchId: "lfa-1",
  finished: false,
  live: true,
  minute: "60",
  homeScore: 2,
  awayScore: 1,
  sourceUpdatedAt: Date.parse(stamp(offset)),
  dayUpdatedAt: Date.parse(stamp(offset)),
  detailsUpdatedAt: Date.parse(stamp(offset)),
  stats: [{ label: "슈팅", home: "5", away: "3" }],
  timeline: [{ kind: "goal", minute: "15" }],
  ...extras,
})
async function write(offset, extras = {}, ids = ["b", "a"]) {
  const result = await db.query(
    "select public.write_lfa_match_snapshot($1, $2, $3, $4) as result",
    [ids, "lfa-1", payload(offset, extras), stamp(offset)]
  )
  return result.rows[0].result
}
async function legacy(id, offset, extras = {}) {
  const info = payload(offset, extras)
  await db.query(
    `insert into public.match_details_cache (game_id, lfa_match_id, payload, finished, updated_at)
    values ($1, 'lfa-1', $2, $3, $4) on conflict (game_id) do update set
    payload = excluded.payload, finished = excluded.finished, updated_at = excluded.updated_at`,
    [id, info, info.finished, stamp(offset)]
  )
}
async function day(offset, matches) {
  return (
    await db.query("select public.write_lfa_day_snapshot('2026-09-07', $1, $2) as written", [
      matches,
      stamp(offset),
    ])
  ).rows[0].written
}

try {
  await db.exec("create role anon; create role authenticated; create role service_role")
  for (const name of [
    "20260824_match_details_cache.sql",
    "20260824b_lfa_day_cache.sql",
    "20260907_lfa_atomic_snapshots.sql",
  ]) {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")
    )
  }
  await check("representative row / sibling ID order", async () => {
    assert.equal((await write(100)).written, true)
    assert.equal((await write(200, {}, ["a", "b"])).written, true)
    const { rows } = await db.query("select game_id from match_details_cache")
    assert.deepEqual(rows, [{ game_id: "a" }])
  })
  await check("late old response cannot overwrite latest", async () => {
    await write(200)
    const result = await write(100, { minute: "30" })
    assert.equal(result.written, false)
    assert.equal(result.payload.minute, "60")
  })
  await check("equal timestamp is idempotent", async () => {
    await write(100)
    assert.equal((await write(100, { homeScore: 99 })).written, false)
  })
  await check("finished cannot regress to live even with newer timestamp", async () => {
    await write(100, { finished: true, live: false })
    assert.equal((await write(200)).written, false)
  })
  await check("newer FT correction / VAR can decrease score and event count", async () => {
    await write(100, { finished: true, live: false })
    const result = await write(200, { finished: true, live: false, homeScore: 1, timeline: [] })
    assert.equal(result.written, true)
    assert.equal(result.payload.homeScore, 1)
    assert.deepEqual(result.payload.timeline, [])
  })
  await check("existing sibling FT is preserved without deleting copies", async () => {
    await legacy("b", 100, { finished: true, live: false })
    await legacy("a", 200)
    const result = await write(300)
    assert.equal(result.written, false)
    assert.equal(result.payload.finished, true)
    assert.equal(
      (await db.query("select count(*)::int as n from match_details_cache")).rows[0].n,
      2
    )
  })
  await check("provider ID protects even callers with incomplete sibling sets", async () => {
    await write(200, {}, ["b"])
    assert.equal((await write(100, {}, ["a"])).written, false)
  })
  await check("newer min timestamp cannot hide older detail component", async () => {
    await write(100, { detailsUpdatedAt: Date.parse(stamp(300)) })
    assert.equal((await write(200)).written, false)
  })
  await check("failed detail response cannot erase a full legacy payload", async () => {
    await legacy("a", 100, { dayUpdatedAt: undefined, detailsUpdatedAt: undefined })
    assert.equal(
      (await write(200, { detailsUpdatedAt: undefined, timeline: [], stats: [] })).written,
      false
    )
  })
  await check("direct old-version writes cannot regress the canonical row", async () => {
    await write(200, { finished: true })
    await legacy("a", 100)
    await legacy("a", 300)
    const { rows } = await db.query(
      "select finished, payload from match_details_cache where game_id = 'a'"
    )
    assert.equal(rows[0].finished, true)
    assert.equal(rows[0].payload.sourceUpdatedAt, Date.parse(stamp(200)))
  })
  await check("date snapshot rejects old, equal and empty regressions", async () => {
    assert.equal(await day(200, [{ id: "match" }]), true)
    assert.equal(await day(100, [{ id: "wrong" }]), false)
    assert.equal(await day(200, [{ id: "wrong" }]), false)
    assert.equal(await day(300, []), false)
    assert.equal(await day(400, [{ id: "corrected" }]), true)
  })
  await check("legacy date update also guarded (trigger shared across both tables)", async () => {
    await day(200, [{ id: "match" }])
    await db.query("update lfa_day_cache set updated_at = $1, payload = '[]', match_count = 0", [
      stamp(300),
    ])
    assert.equal((await db.query("select match_count from lfa_day_cache")).rows[0].match_count, 1)
  })
  await check("mapping conflicts fail closed", async () => {
    await write(100)
    await assert.rejects(
      db.query("select public.write_lfa_match_snapshot($1, $2, $3, $4)", [
        ["a"],
        "other-id",
        { ...payload(200), matchId: "other-id" },
        stamp(200),
      ]),
      /identity conflict/
    )
  })
  await check("RPC privileges are service-role only", async () => {
    const { rows } = await db.query(`select
      has_function_privilege('anon', 'public.write_lfa_match_snapshot(text[],text,jsonb,timestamptz)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.write_lfa_day_snapshot(text,jsonb,timestamptz)', 'execute') as authenticated,
      has_function_privilege('service_role', 'public.write_lfa_match_snapshot(text[],text,jsonb,timestamptz)', 'execute') as service_role`)
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service_role: true })
  })
  console.log(`SQL: ${passed} scenarios passed (isolated PostgreSQL; no production access)`)
} finally {
  await db.close()
}
