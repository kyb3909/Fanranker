// @vitest-environment node
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, describe, it, expect } from "vitest"
let db: PGlite
const baseline = readFileSync("supabase/migrations/00000000000001_prod_schema.sql", "utf8")
const accountSql = readFileSync("supabase/migrations/20260914030000_account_deletion.sql", "utf8")
const sellerSql = readFileSync(
  "supabase/migrations/20260914031000_seller_reward_receipts.sql",
  "utf8"
)
const purchase = "11111111-1111-4111-8111-111111111111"
const activity = "22222222-2222-4222-8222-222222222222"
async function scalar(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows[0]
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;")
  for (const table of [
    "profiles",
    "posts",
    "comments",
    "prediction_purchases",
    "pending_seller_rewards",
    "user_gold",
    "gold_transactions",
  ]) {
    const start = baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."' + table + '" (')
    if (start < 0) throw new Error("missing real table " + table)
    await db.exec(baseline.slice(start, baseline.indexOf("\n);", start) + 3))
  }
  await db.exec(
    "ALTER TABLE profiles ADD UNIQUE(user_id); ALTER TABLE prediction_purchases ADD PRIMARY KEY(id); ALTER TABLE pending_seller_rewards ADD PRIMARY KEY(id); ALTER TABLE user_gold ADD UNIQUE(user_id);"
  )
  const start = baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."reward_gold"(')
  await db.exec(
    baseline.slice(start, baseline.indexOf("$$;", baseline.indexOf("AS $$", start)) + 3)
  )
  await db.exec(
    "INSERT INTO profiles(user_id,nickname) VALUES('owner','Owner'),('other','Other'),('seller','Seller'),('buyer','Buyer');"
  )
  // A historical purchase must never be assumed unpaid when adding the new ledger.
  await db.query(
    "INSERT INTO prediction_purchases(id,buyer_id,seller_id,activity_id) VALUES($1,'buyer','seller',$2)",
    [purchase, activity]
  )
  await db.exec(accountSql)
  await db.exec(sellerSql)
}, 30000)
afterAll(async () => {
  await db.close()
})
describe("account deletion SQL", () => {
  it("erases only the departing author's text and personal fields, preserving other replies", async () => {
    await db.exec(
      "UPDATE profiles SET bio='private',avatar_url='private',favorite_team='private' WHERE user_id='owner';"
    )
    await db.query(
      "INSERT INTO posts(id,user_id,category_id,title,content,image) VALUES($1,'owner',$2,'private','{\"type\":\"doc\"}','private')",
      [purchase, activity]
    )
    await db.query(
      "INSERT INTO comments(post_id,user_id,content) VALUES($1,'owner','private'),($1,'other','reply remains')",
      [purchase]
    )
    await db.query("SELECT request_account_deletion($1)", ["owner"])
    const profile = await scalar(
      "SELECT bio,avatar_url,favorite_team,deleted_at FROM profiles WHERE user_id='owner'"
    )
    expect(profile).toMatchObject({ bio: null, avatar_url: null, favorite_team: null })
    expect(profile.deleted_at).not.toBeNull()
    expect(await scalar("SELECT title,image FROM posts WHERE id=$1", [purchase])).toEqual({
      title: "[삭제된 게시글]",
      image: null,
    })
    expect(await scalar("SELECT content FROM comments WHERE user_id='other'")).toEqual({
      content: "reply remains",
    })
    expect(await scalar("SELECT content FROM comments WHERE user_id='owner'")).toEqual({
      content: "[삭제된 댓글]",
    })
  })
  it("repeated requests retain one durable queue entry", async () => {
    await db.query("SELECT request_account_deletion($1)", ["owner"])
    expect(
      await scalar(
        "SELECT count(*)::int AS count FROM account_deletion_requests WHERE user_id='owner'"
      )
    ).toEqual({ count: 1 })
  })
  it("failure rolls back profile changes and the cleanup queue together", async () => {
    await db.query(
      "INSERT INTO posts(user_id,category_id,title,content) VALUES('other',$1,'keep','{}')",
      [activity]
    )
    await db.exec(
      "CREATE FUNCTION block_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER block_cleanup BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION block_cleanup();"
    )
    await expect(db.query("SELECT request_account_deletion('other')")).rejects.toThrow(
      "injected failure"
    )
    await db.exec("DROP TRIGGER block_cleanup ON posts")
    expect(await scalar("SELECT deleted_at FROM profiles WHERE user_id='other'")).toEqual({
      deleted_at: null,
    })
    expect(
      await scalar(
        "SELECT count(*)::int AS count FROM account_deletion_requests WHERE user_id='other'"
      )
    ).toEqual({ count: 0 })
  })
  it("clients cannot delete another account or inspect the provider cleanup queue", async () => {
    await db.exec("SET ROLE authenticated")
    try {
      await expect(db.query("SELECT request_account_deletion('other')")).rejects.toThrow(
        "permission denied"
      )
      await expect(db.query("SELECT * FROM account_deletion_requests")).rejects.toThrow(
        "permission denied"
      )
    } finally {
      await db.exec("RESET ROLE")
    }
  })
})
describe("seller payment SQL", () => {
  const fresh = "33333333-3333-4333-8333-333333333333"
  it("old app purchases stay legacy during a rolling deployment", async () => {
    const id = "55555555-5555-4555-8555-555555555555"
    await db.query(
      "INSERT INTO prediction_purchases(id,buyer_id,seller_id,activity_id) VALUES($1,'buyer','seller',$2)",
      [id, activity]
    )
    expect(
      await scalar("SELECT reward_version FROM prediction_purchases WHERE id=$1", [id])
    ).toEqual({ reward_version: "legacy" })
    await expect(db.query("SELECT pay_analysis_seller($1)", [id])).rejects.toThrow(
      "legacy purchase"
    )
  })
  it("refuses to repay historical purchases without reconciliation", async () => {
    await expect(db.query("SELECT pay_analysis_seller($1)", [purchase])).rejects.toThrow(
      "legacy purchase"
    )
    expect(await scalar("SELECT count(*)::int AS count FROM gold_transactions")).toEqual({
      count: 0,
    })
  })
  it("a lost acknowledgement and repeated retry pay one purchase only once", async () => {
    await db.query(
      "INSERT INTO prediction_purchases(id,buyer_id,seller_id,activity_id,reward_version) VALUES($1,'buyer','seller',$2,'receipt-v1')",
      [fresh, activity]
    )
    await db.query("SELECT pay_analysis_seller($1)", [fresh])
    const again = await scalar("SELECT pay_analysis_seller($1) AS result", [fresh])
    expect(again.result).toMatchObject({ success: true, duplicate: true })
    expect(await scalar("SELECT gold_balance FROM user_gold WHERE user_id='seller'")).toEqual({
      gold_balance: 450,
    })
    expect(await scalar("SELECT count(*)::int AS count FROM gold_transactions")).toEqual({
      count: 1,
    })
  })
  it("duplicate queue rows close without a second payment", async () => {
    for (let i = 0; i < 2; i++) {
      const row = await scalar(
        "INSERT INTO pending_seller_rewards(seller_id,buyer_id,activity_id,purchase_id,amount) VALUES('seller','buyer',$1,$2,450) RETURNING id",
        [activity, fresh]
      )
      await db.query("SELECT retry_pending_seller_reward($1)", [row.id])
      expect(
        await scalar("SELECT status FROM pending_seller_rewards WHERE id=$1", [row.id])
      ).toEqual({ status: "resolved" })
    }
    expect(await scalar("SELECT gold_balance FROM user_gold WHERE user_id='seller'")).toEqual({
      gold_balance: 450,
    })
  })
  it("mismatched queued amounts cannot move money or close the obligation", async () => {
    const row = await scalar(
      "INSERT INTO pending_seller_rewards(seller_id,buyer_id,activity_id,purchase_id,amount) VALUES('seller','buyer',$1,$2,999) RETURNING id",
      [activity, fresh]
    )
    await expect(db.query("SELECT retry_pending_seller_reward($1)", [row.id])).rejects.toThrow(
      "queue does not match"
    )
    expect(await scalar("SELECT status FROM pending_seller_rewards WHERE id=$1", [row.id])).toEqual(
      { status: "pending" }
    )
  })
  it("receipt and balance roll back together when reward fails", async () => {
    const id = "44444444-4444-4444-8444-444444444444"
    await db.query(
      "INSERT INTO prediction_purchases(id,buyer_id,seller_id,activity_id,reward_version) VALUES($1,'buyer','seller',$2,'receipt-v1')",
      [id, activity]
    )
    await db.exec(
      "CREATE FUNCTION block_gold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END $$; CREATE TRIGGER block_gold BEFORE INSERT ON gold_transactions FOR EACH ROW EXECUTE FUNCTION block_gold();"
    )
    await expect(db.query("SELECT pay_analysis_seller($1)", [id])).rejects.toThrow(
      "injected ledger failure"
    )
    await db.exec("DROP TRIGGER block_gold ON gold_transactions")
    expect(
      await scalar(
        "SELECT count(*)::int AS count FROM seller_reward_receipts WHERE purchase_id=$1",
        [id]
      )
    ).toEqual({ count: 0 })
    expect(await scalar("SELECT gold_balance FROM user_gold WHERE user_id='seller'")).toEqual({
      gold_balance: 450,
    })
  })
  it("migration replay keeps existing receipts and never relabels historical purchases", async () => {
    await db.exec(sellerSql)
    expect(
      await scalar("SELECT reward_version FROM prediction_purchases WHERE id=$1", [purchase])
    ).toEqual({ reward_version: "legacy" })
    expect(await scalar("SELECT count(*)::int AS count FROM seller_reward_receipts")).toEqual({
      count: 1,
    })
  })
  it("authenticated clients cannot call payment functions", async () => {
    await db.exec("SET ROLE authenticated")
    try {
      await expect(db.query("SELECT pay_analysis_seller($1)", [fresh])).rejects.toThrow(
        "permission denied"
      )
    } finally {
      await db.exec("RESET ROLE")
    }
  })
})
