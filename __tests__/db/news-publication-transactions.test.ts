// @vitest-environment node
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { canonicalSourceUrl } from "@/lib/news/canonical-url"

let db: PGlite
const bot = "user_bot_soccer_kr"
const category = "11111111-1111-4111-8111-111111111111"
const content = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "검증된 기사 본문이다." }] }],
}
const draft = { title: "기사 제목", content, original: { title: "원본 제목", content } }
async function row(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0]
}
async function seed(id: string, source: string | null = null) {
  await db.query("INSERT INTO news_reservoir(id,status,urls,draft) VALUES($1,'drafted',$2,$3)", [
    id,
    JSON.stringify({ source }),
    JSON.stringify(draft),
  ])
}
async function publish(
  id: string,
  source: string | null = null,
  duplicate: string | null = null,
  expectedUpdatedAt?: string | null
) {
  const expected =
    expectedUpdatedAt === undefined
      ? (await row("SELECT updated_at::text AS value FROM news_reservoir WHERE id=$1", [id]))?.value
      : expectedUpdatedAt
  return (
    await row("SELECT publish_news_draft_atomic($1,$2,$3,$4,$5,$6,$7) AS value", [
      id,
      JSON.stringify({
        user_id: bot,
        category_id: category,
        community_slug: "football",
        title: draft.title,
        content,
        source_url: source,
      }),
      JSON.stringify(draft),
      JSON.stringify({ auto: true, pre_edit: draft.original }),
      source ? canonicalSourceUrl(source) : null,
      duplicate,
      expected,
    ])
  ).value
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL,category_id uuid NOT NULL,
      community_slug text,title text NOT NULL,content jsonb NOT NULL,image text,source_url text,flair_id uuid,
      created_at timestamptz DEFAULT now(),deleted_at timestamptz);
    CREATE TABLE news_reservoir(id text PRIMARY KEY,status text NOT NULL,urls jsonb NOT NULL,draft jsonb,publish jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`)
  await db.exec(
    readFileSync("supabase/migrations/20260916150000_atomic_news_publication.sql", "utf8")
  )
}, 30000)
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec(
    "DROP TRIGGER IF EXISTS reject_receipt ON news_reservoir; TRUNCATE posts,news_reservoir"
  )
})

describe("atomic news publication", () => {
  it("publishes only one of two simultaneously submitted drafts with canonical-equivalent URLs", async () => {
    const first = "https://www.example.com/story/?utm_source=x#ref"
    const second = "https://example.com/story"
    await seed("first", first)
    await seed("second", second)
    // PGlite serializes requests through one backend; these real SQL calls test the committed
    // state seen by the next contender. Production also uses a transaction-scoped advisory lock.
    const results = await Promise.all([publish("first", first), publish("second", second)])
    expect(results.map((r) => r.outcome).sort()).toEqual(["duplicate", "published"])
    expect(new Set(results.map((r) => r.post_id)).size).toBe(1)
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(1)
    expect(
      (await row("SELECT count(*)::int AS n FROM news_reservoir WHERE status='drafted'")).n
    ).toBe(1)
  })

  it("serializes same-draft publication even without a URL and preserves learning metadata", async () => {
    await seed("same")
    const results = await Promise.all([publish("same"), publish("same")])
    expect(results.map((r) => r.outcome).sort()).toEqual(["already_published", "published"])
    expect(results[0].post_id).toBe(results[1].post_id)
    const stored = await row("SELECT status,draft,publish FROM news_reservoir")
    expect(stored).toMatchObject({
      status: "published",
      draft,
      publish: { auto: true, pre_edit: draft.original, post_id: results[0].post_id },
    })
  })

  it("recovers a lost successful response using its existing post instead of another insert", async () => {
    const source = "https://example.com/retry"
    await seed("retry", source)
    const committed = await publish("retry", source)
    const retried = await publish("retry", source, committed.post_id)
    expect(retried).toEqual({ outcome: "already_published", post_id: committed.post_id })
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(1)
  })

  it("rolls back the inserted post if its reservoir receipt fails, allowing a clean retry", async () => {
    await seed("failure")
    await db.exec(`CREATE OR REPLACE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated receipt storage failure'; END $$;
      CREATE TRIGGER reject_receipt BEFORE UPDATE ON news_reservoir FOR EACH ROW EXECUTE FUNCTION fail_receipt();`)
    await expect(publish("failure")).rejects.toThrow("simulated receipt storage failure")
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(0)
    expect(await row("SELECT status,publish FROM news_reservoir")).toEqual({
      status: "drafted",
      publish: null,
    })
    await db.exec("DROP TRIGGER reject_receipt ON news_reservoir")
    expect((await publish("failure")).outcome).toBe("published")
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(1)
  })

  it("blocks a pre-migration duplicate and permits a new draft after the old post is deleted", async () => {
    const source = "https://example.com/legacy"
    const existing = await row(
      "INSERT INTO posts(user_id,category_id,title,content,source_url) VALUES($1,$2,'기존 기사',$3,$4) RETURNING id",
      [bot, category, JSON.stringify(content), source]
    )
    await seed("legacy", source)
    expect((await publish("legacy", source, existing.id)).outcome).toBe("duplicate")
    await db.query("UPDATE posts SET deleted_at=now() WHERE id=$1", [existing.id])
    expect((await publish("legacy", source, existing.id)).outcome).toBe("published")
  })

  it("preserves the 48-hour duplicate window for receipts as well as preflight results", async () => {
    const source = "https://example.com/window"
    await seed("old", source)
    const old = await publish("old", source)
    await db.query("UPDATE posts SET created_at=now()-interval '49 hours' WHERE id=$1", [
      old.post_id,
    ])
    await seed("new", source)
    expect((await publish("new", source, old.post_id)).outcome).toBe("published")
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(2)
  })

  it("does not publish a rejected or source-changed draft and never resurrects a deleted post", async () => {
    await seed("rejected")
    await db.exec("UPDATE news_reservoir SET status='rejected' WHERE id='rejected'")
    await expect(publish("rejected")).rejects.toMatchObject({ code: "40001" })
    await seed("changed", "https://example.com/new-source")
    await expect(publish("changed", "https://example.com/old-source")).rejects.toMatchObject({
      code: "40001",
    })
    await seed("deleted")
    const post = await publish("deleted")
    await db.query("UPDATE posts SET deleted_at=now() WHERE id=$1", [post.post_id])
    await expect(publish("deleted")).rejects.toMatchObject({ code: "40001" })
    expect((await row("SELECT count(*)::int AS n FROM posts WHERE deleted_at IS NULL")).n).toBe(0)
  })

  it("rejects malformed input before insertion", async () => {
    await seed("invalid")
    await expect(
      row("SELECT publish_news_draft_atomic('invalid','{}','{}','{}',NULL,NULL)")
    ).rejects.toMatchObject({ code: "22023" })
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(0)
  })

  it("preserves a human edit committed while publication preparation was running", async () => {
    await seed("edited")
    const loadedAt = (
      await row("SELECT updated_at::text AS value FROM news_reservoir WHERE id='edited'")
    ).value
    await db.exec(
      "UPDATE news_reservoir SET draft=jsonb_set(draft,'{title}','\"데스크가 고친 제목\"'),updated_at=updated_at+interval '1 second' WHERE id='edited'"
    )
    await expect(publish("edited", null, null, loadedAt)).rejects.toMatchObject({ code: "40001" })
    expect(await row("SELECT draft->>'title' AS title,status FROM news_reservoir")).toEqual({
      title: "데스크가 고친 제목",
      status: "drafted",
    })
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(0)
  })

  it("fails closed when the caller did not load a draft version", async () => {
    await seed("unversioned")
    await expect(publish("unversioned", null, null, null)).rejects.toMatchObject({ code: "40001" })
    expect((await row("SELECT count(*)::int AS n FROM posts")).n).toBe(0)
  })

  it("allows only service_role to execute the security-definer publication RPC", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(
        (
          await row(
            "SELECT has_function_privilege($1,'publish_news_draft_atomic(text,jsonb,jsonb,jsonb,text,uuid,timestamptz)','EXECUTE') AS allowed",
            [role]
          )
        ).allowed
      ).toBe(role === "service_role")
    }
  })
})
