// @vitest-environment node
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
let db: PGlite
const migration = readFileSync(
  "supabase/migrations/20260915090000_admin_training_center.sql",
  "utf8"
)
async function row(sql: string, args: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, args)).rows[0]
}
const entry = (overrides: Record<string, unknown> = {}) => ({
  category: "player",
  preferred_ko: "테스트 선수",
  romanized: "Test Player",
  surfaces: ["test player", "테스트 선수"],
  disambiguation: "",
  notes: "확인",
  ...overrides,
})
async function save(value: unknown, expected: string | null = null, remove = false) {
  return row("SELECT save_news_notation_entry($1,$2,$3,'owner') AS result", [
    JSON.stringify(value),
    expected,
    remove,
  ])
}
async function rule(value: Record<string, unknown> = {}) {
  return row("SELECT save_news_editorial_rule($1,'owner') AS result", [
    JSON.stringify({
      title: "출처 귀속",
      category: "attribution",
      instruction: "원문에 보도한 주체를 밝힌다.",
      priority: 50,
      active: true,
      version: 0,
      ...value,
    }),
  ])
}
async function enqueue(kind = "news_evaluation") {
  return (
    await row("SELECT enqueue_admin_training($1,$2,'owner') AS id", [
      kind,
      JSON.stringify({ example: "snapshot" }),
    ])
  ).id as string
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
  await db.exec(readFileSync("supabase/migrations/20260914080000_news_desk_learning.sql", "utf8"))
  await db.exec(
    `CREATE TABLE news_alias_dictionary(id text PRIMARY KEY,category text NOT NULL,preferred_ko text NOT NULL,romanized text NOT NULL,surfaces text[] NOT NULL,hangul_alts text[],disambiguation text,confidence double precision NOT NULL,notes text,updated_at timestamptz NOT NULL DEFAULT now());`
  )
  await db.exec(readFileSync("supabase/migrations/20260724_agg_training.sql", "utf8"))
  await db.exec(
    "CREATE TABLE team_dictionary(soccerway_team_id text PRIMARY KEY,name_en text,name_kr text)"
  )
  await db.exec(readFileSync("supabase/migrations/20260816_team_squads.sql", "utf8"))
  await db.exec(migration)
  await db.exec(
    readFileSync("supabase/migrations/20260915100000_admin_editorial_workflow.sql", "utf8")
  )
}, 30000)
afterAll(async () => {
  await db?.close()
})
beforeEach(async () => {
  await db.exec(
    "TRUNCATE admin_training_audit,news_editorial_rules,news_alias_dictionary,admin_training_jobs,news_desk_items,team_dictionary CASCADE; UPDATE news_training_settings SET publish_enabled=NULL,per_run_cap=2,daily_job_limit=12,version=0;"
  )
})
describe("administrator training transactions", () => {
  it("reopens an imported real article without overwriting the editor's saved copy", async () => {
    const original = {
      title: "기존 기사 제목",
      article: "실제로 올라온 기존 기사의 본문을 그대로 가져옵니다. 새로 작성하지 않습니다.",
    }
    const first = await row(
      "SELECT import_news_desk_article('post','post-1',$1,'[]','owner') AS result",
      [JSON.stringify(original)]
    )
    expect(first.result.existing).toBe(false)
    await db.query("SELECT save_news_desk_edit($1,0,$2,$3,'','owner','drafted')", [
      first.result.id,
      "기자가 고친 제목",
      original.article,
    ])
    const again = await row(
      "SELECT import_news_desk_article('post','post-1',$1,'[]','owner') AS result",
      [JSON.stringify(original)]
    )
    expect(again.result).toEqual({ id: first.result.id, existing: true })
    expect((await row("SELECT draft FROM news_desk_items")).draft.title).toBe("기자가 고친 제목")
  })
  it("stores AI interpretations inactive until the editor has reviewed them", async () => {
    const original = {
      title: "기존 기사 제목",
      article: "실제로 올라온 기존 기사의 본문을 그대로 가져옵니다. 새로 작성하지 않습니다.",
    }
    const item = await row(
      "SELECT import_news_desk_article('draft','r1',$1,'[]','owner') AS result",
      [JSON.stringify(original)]
    )
    const saved = await row(
      "SELECT save_news_desk_edit($1,0,'기자가 고친 제목',$2,'','owner','drafted') AS result",
      [item.result.id, original.article]
    )
    const token = randomUUID()
    await db.query("SELECT * FROM claim_news_desk_learning($1,$2)", [
      token,
      saved.result.revision_id,
    ])
    await db.query("SELECT complete_news_desk_learning($1,$2,$3)", [
      saved.result.revision_id,
      token,
      JSON.stringify([
        {
          category: "style",
          field: "title",
          wrong: original.title,
          correct: "기자가 고친 제목",
          explanation: "AI 해석: 제목을 간결하게 정리한 것으로 보입니다.",
          instruction: "제목에서 반복되는 표현을 정리한다.",
          scope: "general",
        },
      ]),
    ])
    expect(await row("SELECT active,review_status FROM news_desk_lessons")).toEqual({
      active: false,
      review_status: "pending",
    })
  })
  it("saves a roster and article notation together; conflicts retain only the failed row", async () => {
    await db.exec(
      "INSERT INTO team_dictionary VALUES('arsenal','Arsenal','아스널'); INSERT INTO team_squads(soccerway_team_id,player_id,player_slug,name_en) VALUES('arsenal','saka','saka-bukayo','Bukayo Saka'),('arsenal','other','other-player','Other Player')"
    )
    await save(
      entry({
        preferred_ko: "이미 확정한 선수",
        romanized: "Other Player",
        surfaces: ["Other Player"],
      })
    )
    const squads = (
      await db.query<Record<string, string>>(
        "SELECT player_id,updated_at::text AS stamp FROM team_squads"
      )
    ).rows
    const changes = squads.map((s) => ({
      key: s.player_id,
      kind: "squad",
      id: s.player_id,
      team_id: "arsenal",
      expected: s.stamp,
      name_kr: s.player_id === "saka" ? "부카요 사카" : "다른 한글명",
      given_name_ko: "부카요",
      family_name_ko: "사카",
      short_name_ko: "사카",
    }))
    const saved = await row("SELECT save_player_naming_rows($1,'owner') AS result", [
      JSON.stringify(changes),
    ])
    expect(saved.result.saved).toEqual(["saka"])
    expect(saved.result.failed).toHaveLength(1)
    expect(
      (await row("SELECT name_kr,status FROM team_squads WHERE player_id='saka'")).status
    ).toBe("confirmed")
    expect(
      (await row("SELECT name_kr FROM team_squads WHERE player_id='other'")).name_kr
    ).toBeNull()
    expect(
      (await row("SELECT short_name_ko FROM news_alias_dictionary WHERE romanized='Bukayo Saka'"))
        .short_name_ko
    ).toBe("사카")
    const stale = await row("SELECT save_player_naming_rows($1,'owner') AS result", [
      JSON.stringify([changes.find((c) => c.id === "saka")]),
    ])
    expect(stale.result.saved).toHaveLength(0)
    expect(stale.result.failed[0].error).toContain("다른 창")
    const known = await row(
      "SELECT id,updated_at::text AS stamp FROM news_alias_dictionary WHERE romanized='Other Player'"
    )
    const reviewed = await row("SELECT save_player_naming_rows($1,'owner') AS result", [
      JSON.stringify([
        { ...changes.find((c) => c.id === "other"), news_id: known.id, news_expected: known.stamp },
      ]),
    ])
    expect(reviewed.result.saved).toEqual(["other"])
    expect((await row("SELECT name_kr FROM team_squads WHERE player_id='other'")).name_kr).toBe(
      "다른 한글명"
    )
    expect(
      (
        await row("SELECT preferred_ko,hangul_alts FROM news_alias_dictionary WHERE id=$1", [
          known.id,
        ])
      ).hangul_alts
    ).toContain("이미 확정한 선수")
  })
  it("does not enable live publishing during migration; rejects stale settings", async () => {
    expect(
      (await row("SELECT publish_enabled FROM news_training_settings")).publish_enabled
    ).toBeNull()
    await db.query("SELECT save_news_training_setting(0,false,3,5,'owner')")
    await expect(db.query("SELECT save_news_training_setting(0,true,3,5,'owner')")).rejects.toThrow(
      "settings changed"
    )
    expect((await row("SELECT publish_enabled FROM news_training_settings")).publish_enabled).toBe(
      false
    )
  })
  it("saves and audits dictionary changes atomically and preserves stale editors", async () => {
    const saved = await save(entry())
    const old = await row(
      "SELECT *,updated_at::text AS stamp FROM news_alias_dictionary WHERE id=$1",
      [saved.result.id]
    )
    await save(entry({ id: old.id, preferred_ko: "테스트 플레이어" }), old.stamp)
    await expect(save(entry({ id: old.id, preferred_ko: "덮어쓰기" }), old.stamp)).rejects.toThrow(
      "entry changed"
    )
    expect((await row("SELECT count(*)::int AS n FROM admin_training_audit")).n).toBe(2)
  })
  it("blocks another entity from claiming an existing alias, including player vs coach", async () => {
    await save(entry())
    await expect(
      save(entry({ category: "coach", preferred_ko: "다른 감독", romanized: "Other Coach" }))
    ).rejects.toThrow("별칭이 다른 항목과 겹칩니다")
    expect((await row("SELECT count(*)::int AS n FROM news_alias_dictionary")).n).toBe(1)
  })
  it("stores explicit person components without treating shared surnames as entity aliases", async () => {
    await save(
      entry({
        preferred_ko: "부카요 사카",
        romanized: "Bukayo Saka",
        surfaces: ["Bukayo Saka"],
        given_name_ko: "부카요",
        family_name_ko: "사카",
        short_name_ko: "사카",
      })
    )
    const saved = await row("SELECT * FROM news_alias_dictionary WHERE romanized='Bukayo Saka'")
    expect(saved.given_name_ko).toBe("부카요")
    expect(saved.family_name_ko).toBe("사카")
    expect(saved.short_name_ko).toBe("사카")
    expect(saved.hangul_alts).not.toContain("사카")
    await save(
      entry({
        preferred_ko: "김민재",
        romanized: "Kim Min-jae",
        surfaces: ["Kim Min-jae"],
        given_name_ko: "민재",
        family_name_ko: "김",
        short_name_ko: "김민재",
      })
    )
    await save(
      entry({
        preferred_ko: "김영권",
        romanized: "Kim Young-gwon",
        surfaces: ["Kim Young-gwon"],
        given_name_ko: "영권",
        family_name_ko: "김",
        short_name_ko: "김영권",
      })
    )
    expect(
      (await row("SELECT count(*)::int AS n FROM news_alias_dictionary WHERE family_name_ko='김'"))
        .n
    ).toBe(2)
    await save(
      entry({
        category: "team",
        preferred_ko: "아스널",
        romanized: "Arsenal",
        surfaces: [],
        family_name_ko: "사카",
      })
    )
    expect(
      (await row("SELECT family_name_ko FROM news_alias_dictionary WHERE category='team'"))
        .family_name_ko
    ).toBe("")
  })
  it("retains a recoverable snapshot when deleting a notation", async () => {
    await save(entry())
    const old = await row("SELECT id,updated_at::text AS stamp FROM news_alias_dictionary")
    await save({ id: old.id }, old.stamp, true)
    expect(
      (await row("SELECT before_value FROM admin_training_audit WHERE kind='dictionary_delete'"))
        .before_value.preferred_ko
    ).toBe("테스트 선수")
  })
  it("keeps an active-rule budget and rejects concurrent/stale rule edits", async () => {
    const first = (await rule()).result
    await rule({ id: first.id, version: 0, active: false })
    await expect(rule({ id: first.id, version: 0 })).rejects.toThrow("rule changed")
    for (let i = 0; i < 20; i++) await rule({ title: `원칙 ${i}` })
    await expect(rule()).rejects.toThrow("active rule limit")
  })
  it("reserves only one job when buttons are clicked concurrently", async () => {
    const result = await Promise.allSettled([enqueue(), enqueue()])
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1)
  })
  it("claims queued work only once across immediate runner and cron", async () => {
    const id = await enqueue()
    const first = await db.query("SELECT * FROM claim_admin_training($1,$2)", [id, randomUUID()])
    const second = await db.query("SELECT * FROM claim_admin_training($1,$2)", [id, randomUUID()])
    expect(first.rows).toHaveLength(1)
    expect(second.rows).toHaveLength(0)
  })
  it("counts failed attempts in daily budget and expires lost workers", async () => {
    const id = await enqueue()
    await db.query("SELECT * FROM claim_admin_training($1,$2)", [id, randomUUID()])
    await db.exec(
      "UPDATE admin_training_jobs SET lease_until=now()-interval '1 second'; UPDATE news_training_settings SET daily_job_limit=1;"
    )
    await db.query("SELECT * FROM claim_admin_training(NULL,$1)", [randomUUID()])
    expect((await row("SELECT status FROM admin_training_jobs")).status).toBe("failed")
    await expect(enqueue()).rejects.toThrow("오늘의 연습·평가 실행 한도")
  })
  it("stores community practice and job completion together and rejects a stale worker", async () => {
    const id = await enqueue("agg_generation"),
      token = randomUUID()
    await db.query("SELECT * FROM claim_admin_training($1,$2)", [id, token])
    const practice = JSON.stringify({
      source_title: "소재",
      category: "football",
      body_excerpt: "확인한 원문 자료",
      media: [],
      persona: "연습",
      structure: "one_point",
      ai_title: "연습 제목",
      ai_body: "확인한 자료를 바탕으로 작성한 연습",
      applied_training_ids: [],
    })
    expect(
      (
        await row("SELECT complete_admin_training($1,$2,$3,$4) AS ok", [
          id,
          randomUUID(),
          "{}",
          practice,
        ])
      ).ok
    ).toBe(false)
    expect((await row("SELECT count(*)::int AS n FROM agg_training_entries")).n).toBe(0)
    expect(
      (await row("SELECT complete_admin_training($1,$2,$3,$4) AS ok", [id, token, "{}", practice]))
        .ok
    ).toBe(true)
    expect((await row("SELECT count(*)::int AS n FROM agg_training_entries")).n).toBe(1)
    expect((await row("SELECT status,result FROM admin_training_jobs")).status).toBe("completed")
    expect(
      (await row("SELECT complete_admin_training($1,$2,$3,$4) AS ok", [id, token, "{}", practice]))
        .ok
    ).toBe(false)
  })
  it("rolls back community completion if generated entry cannot be stored", async () => {
    const id = await enqueue("agg_generation"),
      token = randomUUID()
    await db.query("SELECT * FROM claim_admin_training($1,$2)", [id, token])
    await expect(
      row("SELECT complete_admin_training($1,$2,$3,$4)", [id, token, "{}", "{}"])
    ).rejects.toThrow()
    expect((await row("SELECT status FROM admin_training_jobs")).status).toBe("running")
    expect((await row("SELECT count(*)::int AS n FROM agg_training_entries")).n).toBe(0)
  })
  it("denies anonymous and authenticated access to private data and execution", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`)
      await expect(db.query("SELECT * FROM admin_training_jobs")).rejects.toThrow(
        "permission denied"
      )
      await expect(enqueue()).rejects.toThrow("permission denied")
      await db.exec("RESET ROLE")
    }
  })
})
