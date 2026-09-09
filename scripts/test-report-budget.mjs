/** Isolated PostgreSQL tests; no application env, network, or production DB.
 * Reuses the PGlite installation used by scripts/test-lfa-snapshots.mjs.
 * PGlite has one connection; this tests SQL constraints/leases, not multi-session load.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "../output/lfa-snapshot-test/node_modules/@electric-sql/pglite/dist/index.js"

const db = new PGlite()
let passed = 0
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const claim = async () => (await query("select claim_match_report('game') as v"))[0].v
const reserve = async (token, version = "v1") =>
  (await query("select reserve_report_compose('game',$1,$2) as v", [token, version]))[0].v
async function finish(token, id, draft = null) {
  return query("select finish_report_compose('game',$1,$2,$3,$4,$5,$6)", [
    token,
    id,
    draft ? "draft" : "compose",
    draft ? null : "empty response",
    draft ? true : null,
    draft,
  ])
}
async function check(name, run) {
  await db.exec("truncate match_report_attempts, match_report_work restart identity")
  await run()
  console.log("PASS " + name)
  passed++
}
async function setup() {
  const lease = await claim()
  await query(
    "update match_report_work set input_version='v1',event_id='event' where game_id='game'"
  )
  return lease.token
}

try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls")
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20260902b_match_report_attempts.sql", import.meta.url),
      "utf8"
    )
  )
  await db.exec("insert into match_report_attempts(game_id,stage) values('legacy','verify')")
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20260910_report_attempt_budget.sql", import.meta.url),
      "utf8"
    )
  )
  assert.deepEqual(
    (
      await query(
        "select input_version,compose_index,compose_called,draft from match_report_attempts"
      )
    )[0],
    { input_version: null, compose_index: null, compose_called: null, draft: null }
  )

  await check("one owner per game, including a different input version", async () => {
    const token = await setup()
    assert.equal(await claim(), null)
    assert.equal((await reserve("00000000-0000-0000-0000-000000000000", "v2")).status, "busy")
    const a = await reserve(token)
    assert.equal(a.attempt.compose_index, 1)
    assert.equal((await reserve(token)).status, "busy")
    await assert.rejects(
      query(
        "insert into match_report_attempts(game_id,stage,input_version,compose_index) values('game','reserve','v1',1)"
      ),
      (error) => error.code === "23505"
    )
  })
  await check("expired reservation consumes budget; late owner is fenced", async () => {
    const old = await setup()
    const first = await reserve(old)
    await db.exec(
      "update match_report_work set lease_until=now()-interval '1 second'; update match_report_attempts set reserved_until=now()-interval '1 second'"
    )
    const next = await claim()
    assert.notEqual(next.token, old)
    await assert.rejects(finish(old, first.attempt.id), /lease expired/)
    const second = await reserve(next.token)
    assert.equal(second.attempt.compose_index, 2)
    assert.equal(
      (await query("select unresolved,used from match_report_work_status"))[0].unresolved,
      1
    )
  })
  await check("six compose-only failures hold; seventh cannot start", async () => {
    const token = await setup()
    for (let i = 1; i <= 6; i++) {
      const a = await reserve(token)
      assert.equal(a.attempt.compose_index, i)
      await query("update match_report_attempts set compose_called=true where id=$1", [
        a.attempt.id,
      ])
      await finish(token, a.attempt.id)
    }
    assert.equal((await reserve(token)).status, "held")
    assert.deepEqual((await query("select status,used,budget from match_report_work_status"))[0], {
      status: "held",
      used: 6,
      budget: 6,
    })
    assert.equal(
      (await query("select count(*)::int as n from match_report_attempts where stage='held'"))[0].n,
      1
    )
    await query("update match_report_work set input_version='v2',status='ready'")
    assert.equal((await reserve(token, "v2")).attempt.compose_index, 1)
  })
  await check("audited manual resume adds exactly three to the same version", async () => {
    let token = await setup()
    for (let i = 0; i < 6; i++) await finish(token, (await reserve(token)).attempt.id)
    await db.exec("update match_report_work set lease_until=null,lease_token=null")
    await assert.rejects(query("select resume_match_report('game','v1','','admin')"), /reason/)
    await assert.rejects(
      query("select resume_match_report('game','old','reason','admin')"),
      /changed/
    )
    await query("select resume_match_report('game','v1','Reviewed evidence','admin')")
    assert.equal(
      (await query("select manual_resume from match_report_work"))[0].manual_resume,
      true
    )
    token = (await claim()).token
    for (let i = 7; i <= 9; i++) {
      const a = await reserve(token)
      assert.equal(a.attempt.compose_index, i)
      await finish(token, a.attempt.id)
    }
    assert.equal((await reserve(token)).status, "held")
    assert.equal((await query("select budget from match_report_work_status"))[0].budget, 9)
    assert.equal(
      (await query("select manual_resume from match_report_work"))[0].manual_resume,
      false
    )
  })
  await check("verified draft and result are durable in one transaction", async () => {
    const token = await setup()
    const a = await reserve(token)
    const draft = { title: "Home 2-1 Away", paragraphs: ["Verified evidence."] }
    await assert.rejects(finish(token, a.attempt.id, draft), /unverified/)
    await query(
      "update match_report_attempts set compose_called=true,verify_called=true where id=$1",
      [a.attempt.id]
    )
    await finish(token, a.attempt.id, draft)
    assert.deepEqual(
      (await query("select draft from match_report_attempts where id=$1", [a.attempt.id]))[0].draft,
      draft
    )
    assert.equal((await query("select status from match_report_work"))[0].status, "draft")
    assert.equal((await reserve(token)).status, "busy")
  })
  await check("browser roles cannot reserve budget or grant resumes", async () => {
    await db.exec("set role authenticated")
    await assert.rejects(claim(), /permission denied/)
    await assert.rejects(
      query("select resume_match_report('game','v1','reason','actor')"),
      /permission denied/
    )
    await db.exec("reset role")
  })
  await check(
    "service role can write dictionary holds and read the protected status view",
    async () => {
      await db.exec("set role service_role")
      const lease = await claim()
      assert.ok(lease.token)
      await query(
        "insert into match_report_attempts(game_id,stage,missing_names) values('game','dictionary',array['Unknown Player'])"
      )
      assert.equal((await query("select used from match_report_work_status"))[0].used, 0)
      await db.exec("reset role")
    }
  )
  console.log(passed + " SQL cases passed (plus legacy-null migration check)")
} finally {
  await db.close()
}
