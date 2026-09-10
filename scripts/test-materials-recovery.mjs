// Isolated PostgreSQL regression checks; no operating DB or environment credentials.
// PGlite has a single connection: this verifies SQL semantics, not multi-session load.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "../output/lfa-snapshot-test/node_modules/@electric-sql/pglite/dist/index.js"

const db = new PGlite()
let passed = 0
async function check(name, fn) {
  await db.exec("truncate public.lfa_material_recovery_attempts")
  await fn()
  console.log(`PASS ${name}`)
  passed++
}
const claim = async (id) => (await db.query("select public.claim_lfa_material_recovery($1) as claimed", [id])).rows[0].claimed
try {
  await db.exec("create role anon; create role authenticated; create role service_role")
  await db.exec(await readFile(new URL("../supabase/migrations/20260910_materials_recovery_attempts.sql", import.meta.url), "utf8"))
  await check("one claim per supplier match during cooldown", async () => {
    assert.equal(await claim("one"), true)
    assert.equal(await claim("one"), false)
    assert.equal((await db.query("select count(*)::int as n from lfa_material_recovery_attempts")).rows[0].n, 1)
  })
  await check("supplier failure has no refund; timestamp stays unchanged", async () => {
    await claim("one")
    const before = (await db.query("select attempted_at from lfa_material_recovery_attempts")).rows[0].attempted_at
    assert.equal(await claim("one"), false)
    assert.deepEqual((await db.query("select attempted_at from lfa_material_recovery_attempts")).rows[0].attempted_at, before)
  })
  await check("elapsed cooldown permits retry", async () => {
    await claim("one")
    await db.exec("update lfa_material_recovery_attempts set attempted_at=now()-interval '16 minutes'")
    assert.equal(await claim("one"), true)
    assert.equal(await claim("one"), false)
  })
  await check("different matches do not block each other", async () => {
    assert.equal(await claim("one"), true)
    assert.equal(await claim("two"), true)
  })
  await check("empty identities cannot reserve", async () => {
    await assert.rejects(() => claim(" "), /missing LFA match ID/)
    await assert.rejects(() => claim(null), /missing LFA match ID/)
  })
  await check("public users cannot call claims or inspect recovery state", async () => {
    const { rows } = await db.query("select has_function_privilege('anon','public.claim_lfa_material_recovery(text)','execute') as callable, has_table_privilege('authenticated','public.lfa_material_recovery_attempts','select') as readable")
    assert.deepEqual(rows[0], { callable: false, readable: false })
  })
  console.log(`${passed} SQL checks passed`)
} finally { await db.close() }
