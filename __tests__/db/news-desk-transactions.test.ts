// @vitest-environment node
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest"
let db: PGlite
const migration = readFileSync("supabase/migrations/20260914080000_news_desk_learning.sql", "utf8")
const sources = JSON.stringify([
  { id: "source", source_url: "https://www.bbc.com/sport/football/one", text: "Captured evidence" },
])
const original = {
  title: "선수 영입 확정",
  article: "BBC는 양 구단이 선수 이적 협상을 진행하고 있다고 보도했다.",
}
async function row(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0]
}
async function claim(source = "source", manual = true) {
  return (
    await row("SELECT claim_news_desk_item($1,$2,$3,$4) AS result", [
      source,
      sources,
      randomUUID(),
      manual,
    ])
  ).result
}
async function drafted() {
  const result = await claim()
  await db.query("UPDATE news_desk_items SET status='drafted',draft=$1,original=$1 WHERE id=$2", [
    JSON.stringify(original),
    result.id,
  ])
  return result.id as string
}
async function edit(id: string, version = 0) {
  return (
    await row("SELECT save_news_desk_edit($1,$2,$3,$4,$5,$6,$7) AS result", [
      id,
      version,
      "선수 영입 협상",
      original.article,
      "확정이 아니라 협상 중이다.",
      "editor",
      "reviewed",
    ])
  ).result
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
  await db.exec(migration)
}, 30000)
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec(
    "TRUNCATE news_desk_items CASCADE; UPDATE news_desk_settings SET enabled=true,pending_target=6,daily_limit=12,lease_until=NULL,lease_token=NULL,next_auto_at=now();"
  )
})
describe("private desk transactions", () => {
  it("reserves one paid job even when two requests arrive together", async () => {
    const results = await Promise.all([claim("a"), claim("b")])
    expect(results.filter((r) => r.id)).toHaveLength(1)
    expect(results.find((r) => r.skipped)?.skipped).toBe("busy")
    expect((await row("SELECT count(*)::int AS n FROM news_desk_items")).n).toBe(1)
  })
  it("enforces pause, hourly cadence, queue capacity, and KST daily quota", async () => {
    await db.exec("UPDATE news_desk_settings SET enabled=false")
    expect(await claim("a", false)).toEqual({ skipped: "paused" })
    await db.exec("UPDATE news_desk_settings SET enabled=true,next_auto_at=now()+interval '1 hour'")
    expect(await claim("a", false)).toEqual({ skipped: "not_due" })
    await drafted()
    await db.exec("UPDATE news_desk_settings SET lease_until=NULL,pending_target=1")
    expect(await claim("b")).toEqual({ skipped: "queue_full" })
    await db.exec(
      "UPDATE news_desk_settings SET pending_target=6,daily_limit=1; UPDATE news_desk_items SET status='reviewed'"
    )
    expect(await claim("b")).toEqual({ skipped: "daily_limit" })
    await db.exec(
      "UPDATE news_desk_items SET created_at=((now() AT TIME ZONE 'Asia/Seoul')::date::timestamp AT TIME ZONE 'Asia/Seoul')-interval '1 second'"
    )
    expect((await claim("b")).id).toBeTruthy()
  })
  it("recovers a crashed generation lease without spending a duplicate job", async () => {
    await claim("a")
    await db.exec(
      "UPDATE news_desk_settings SET lease_until=now()-interval '1 second'; UPDATE news_desk_items SET created_at=now()-interval '11 minutes'"
    )
    expect((await claim("b")).id).toBeTruthy()
    expect(
      (await row("SELECT status FROM news_desk_items WHERE source_reservoir_id='a'")).status
    ).toBe("failed")
  })
  it("saves draft, version, and teaching example together; stale saves preserve the editor's work", async () => {
    const id = await drafted(),
      saved = await edit(id)
    expect(saved).toMatchObject({ version: 1, changed: true })
    expect(
      await row("SELECT original,draft,status FROM news_desk_items WHERE id=$1", [id])
    ).toMatchObject({ original, draft: { title: "선수 영입 협상" }, status: "reviewed" })
    expect(
      await row(
        "SELECT before_draft,after_draft,editor_reason,learning_state FROM news_desk_revisions"
      )
    ).toMatchObject({
      before_draft: original,
      after_draft: { title: "선수 영입 협상" },
      editor_reason: "확정이 아니라 협상 중이다.",
      learning_state: "pending",
    })
    await expect(edit(id, 0)).rejects.toThrow("edit conflict")
    expect((await row("SELECT count(*)::int AS n FROM news_desk_revisions")).n).toBe(1)
  })
  it("rolls back the article if its revision cannot be persisted", async () => {
    const id = await drafted()
    await db.exec(
      "CREATE FUNCTION reject_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected revision failure'; END $$; CREATE TRIGGER fail_revision BEFORE INSERT ON news_desk_revisions FOR EACH ROW EXECUTE FUNCTION reject_revision();"
    )
    await expect(edit(id)).rejects.toThrow("injected revision failure")
    expect(await row("SELECT version,draft FROM news_desk_items WHERE id=$1", [id])).toEqual({
      version: 0,
      draft: original,
    })
    await db.exec(
      "DROP TRIGGER fail_revision ON news_desk_revisions; DROP FUNCTION reject_revision();"
    )
  })
  it("leases learning once and rejects invented examples or stale worker completions", async () => {
    const id = await drafted(),
      saved = await edit(id),
      token = randomUUID()
    expect(
      (await db.query("SELECT * FROM claim_news_desk_learning($1,$2)", [token, saved.revision_id]))
        .rows
    ).toHaveLength(1)
    expect(
      (
        await db.query("SELECT * FROM claim_news_desk_learning($1,$2)", [
          randomUUID(),
          saved.revision_id,
        ])
      ).rows
    ).toHaveLength(0)
    const lesson = {
      category: "certainty",
      field: "title",
      wrong: "확정",
      correct: "협상",
      explanation: "단정 금지",
      instruction: "확인된 단계로 작성",
      scope: "general",
    }
    await expect(
      db.query("SELECT complete_news_desk_learning($1,$2,$3)", [
        saved.revision_id,
        randomUUID(),
        JSON.stringify([lesson]),
      ])
    ).rejects.toThrow("lease lost")
    await expect(
      db.query("SELECT complete_news_desk_learning($1,$2,$3)", [
        saved.revision_id,
        token,
        JSON.stringify([{ ...lesson, wrong: "서명 완료" }]),
      ])
    ).rejects.toThrow("anchored")
    expect(
      (
        await row("SELECT complete_news_desk_learning($1,$2,$3) AS n", [
          saved.revision_id,
          token,
          JSON.stringify([lesson]),
        ])
      ).n
    ).toBe(1)
    expect((await row("SELECT learning_state FROM news_desk_revisions")).learning_state).toBe(
      "ready"
    )
  })
  it("marks a final crashed learning attempt failed instead of leaving it processing forever", async () => {
    const id = await drafted()
    await edit(id)
    await db.exec(
      "UPDATE news_desk_revisions SET learning_state='processing',learning_attempts=3,lease_until=now()-interval '1 second'"
    )
    await db.query("SELECT * FROM claim_news_desk_learning($1)", [randomUUID()])
    expect((await row("SELECT learning_state FROM news_desk_revisions")).learning_state).toBe(
      "failed"
    )
  })
  it("denies anonymous and normal signed-in users table access and security-definer RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role)
      await expect(db.query("SELECT * FROM public.news_desk_items")).rejects.toThrow(
        "permission denied"
      )
      await expect(claim()).rejects.toThrow("permission denied")
      await db.exec("RESET ROLE")
    }
    expect(
      (
        await row(
          "SELECT has_function_privilege('service_role','public.claim_news_desk_item(text,jsonb,uuid,boolean)','EXECUTE') AS ok"
        )
      ).ok
    ).toBe(true)
  })
})
