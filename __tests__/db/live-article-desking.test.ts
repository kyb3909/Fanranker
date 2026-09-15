// @vitest-environment node
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest"
let db: PGlite
const postId = "11111111-1111-4111-8111-111111111111"
const prose = "구단은 선수와 협상 중이라고 밝혔다. 아직 계약에 합의한 단계는 아니다."
const image = { type: "image", attrs: { src: "https://example.com/photo.jpg" } }
const embed = { type: "embed", attrs: { url: "https://example.com/video" } }
const content = {
  type: "doc",
  content: [
    image,
    { type: "paragraph", content: [{ type: "text", text: prose, marks: [{ type: "bold" }] }] },
    { type: "paragraph", content: [embed] },
  ],
}
async function row(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0]
}
async function open(kind = "post", id = postId) {
  const opened = await row("SELECT open_news_desk_article($1,$2,'[]','editor') AS value", [
    kind,
    id,
  ])
  return row("SELECT * FROM news_desk_items WHERE id=$1", [opened.value.id])
}
async function save(item: Record<string, any>, title = "선수 영입 협상 진행", article = prose) {
  return row("SELECT save_news_desk_article($1,$2,$3,$4,'','editor','reviewed') AS value", [
    item.id,
    item.version,
    title,
    article,
  ])
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
  await db.exec(readFileSync("supabase/migrations/20260914080000_news_desk_learning.sql", "utf8"))
  await db.exec(`ALTER TABLE news_desk_items ADD COLUMN origin jsonb;
    CREATE TABLE admin_training_audit(actor text,kind text,target text,after_value jsonb);
    CREATE TABLE posts(id uuid PRIMARY KEY,user_id text,title text,content jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),deleted_at timestamptz);
    CREATE TABLE news_reservoir(id text PRIMARY KEY,status text,draft jsonb,publish jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`)
  await db.exec(
    readFileSync("supabase/migrations/20260915100000_admin_editorial_workflow.sql", "utf8").split(
      "-- One row"
    )[0]
  )
  await db.exec(readFileSync("supabase/migrations/20260916090000_live_article_desking.sql", "utf8"))
}, 30000)
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec("TRUNCATE news_desk_items,posts,news_reservoir CASCADE")
  await db.query(
    "INSERT INTO posts(id,user_id,title,content) VALUES($1,'user_bot_soccer_kr','선수 영입 확정',$2)",
    [postId, JSON.stringify(content)]
  )
  await db.query(
    "INSERT INTO news_reservoir(id,status,draft,publish) VALUES('source','published',$1,$2)",
    [JSON.stringify({ title: "선수 영입 확정", content }), JSON.stringify({ postId })]
  )
})
describe("live article desking transactions", () => {
  it("saves the post, linked draft and human learning example together without losing rich content on a title-only edit", async () => {
    const item = await open()
    expect((await save(item)).value).toMatchObject({ changed: true, applied_to_article: true })
    expect(await row("SELECT title,content FROM posts")).toEqual({
      title: "선수 영입 협상 진행",
      content,
    })
    const reservoir = await row("SELECT draft,status FROM news_reservoir")
    expect(reservoir.status).toBe("published")
    expect(reservoir.draft.title).toBe("선수 영입 협상 진행")
    expect(reservoir.draft.original.title).toBe("선수 영입 확정")
    expect(
      await row(
        "SELECT before_draft->>'title' AS before,after_draft->>'title' AS after,learning_state FROM news_desk_revisions"
      )
    ).toEqual({ before: "선수 영입 확정", after: "선수 영입 협상 진행", learning_state: "pending" })
  })
  it("keeps images and nested embeds when prose is rewritten", async () => {
    await save(
      await open(),
      "구단의 협상 상황",
      "구단은 협상을 진행하고 있다. 계약 체결 여부는 아직 확인되지 않았다.\n\n추가 발표는 없었다."
    )
    const stored = (await row("SELECT content FROM posts")).content
    expect(stored.content).toContainEqual(image)
    expect(stored.content).toContainEqual(embed)
    expect(
      (await row("SELECT news_desk_plain_text(content) AS text FROM posts")).text
    ).not.toContain(prose)
  })
  it("rejects external edits and stale versions without saving partial changes or learning", async () => {
    const item = await open()
    await db.exec("UPDATE posts SET title='다른 편집자의 제목'")
    await expect(save(item)).rejects.toMatchObject({ code: "40001" })
    expect((await row("SELECT count(*)::int AS n FROM news_desk_revisions")).n).toBe(0)
    const current = await open()
    expect(current.draft.title).toBe("다른 편집자의 제목")
    await save(current)
    await expect(save(current, "오래된 창에서 덮어쓰기")).rejects.toMatchObject({ code: "40001" })
    expect((await row("SELECT title FROM posts")).title).toBe("선수 영입 협상 진행")
  })
  it.each(["drafted", "rejected"])(
    "edits legacy %s drafts without publishing them",
    async (status) => {
      await db.query("INSERT INTO news_reservoir(id,status,draft) VALUES('old',$1,$2)", [
        status,
        JSON.stringify({ headline: "이전 기사 제목", body: prose }),
      ])
      const item = await open("draft", "old")
      expect(item.draft.article).toBe(prose)
      await save(item)
      const stored = await row("SELECT draft,status,publish FROM news_reservoir WHERE id='old'")
      expect(stored.status).toBe(status)
      expect(stored.publish).toBeNull()
      expect(stored.draft.original.headline).toBe("이전 기사 제목")
    }
  )
  it("does not resurrect deleted posts and lists archives with no recent-history cap or duplicate published entries", async () => {
    await db.exec(
      "UPDATE posts SET deleted_at=now(); INSERT INTO news_reservoir(id,status,draft,created_at) SELECT 'old-'||n,'rejected','{\"headline\":\"과거 기사\",\"body\":\"이전 본문\"}'::jsonb,now()-interval '1 year' FROM generate_series(1,110) n"
    )
    await save(await open())
    expect((await row("SELECT deleted_at FROM posts")).deleted_at).not.toBeNull()
    expect((await row("SELECT count(*)::int AS n FROM news_desk_catalog")).n).toBe(111)
    expect((await row("SELECT status FROM news_desk_catalog WHERE id=$1", [postId])).status).toBe(
      "deleted"
    )
  })
  it("denies ordinary API roles access to archive data and privileged save functions", async () => {
    expect(
      (await row("SELECT has_table_privilege('anon','news_desk_catalog','SELECT') AS allowed"))
        .allowed
    ).toBe(false)
    expect(
      (
        await row(
          "SELECT has_function_privilege('authenticated','save_news_desk_article(uuid,integer,text,text,text,text,text)','EXECUTE') AS allowed"
        )
      ).allowed
    ).toBe(false)
  })
})
