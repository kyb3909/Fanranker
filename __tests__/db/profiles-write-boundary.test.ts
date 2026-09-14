// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

// An in-memory PostgreSQL engine; no application environment, network, or real
// users. Replay the actual profiles slice, not a hand-written copy of its ACL.
const migrations = resolve(process.cwd(), "supabase/migrations")
const source = readFileSync(resolve(migrations, "00000000000001_prod_schema.sql"), "utf8")
const hardening = readFileSync(
  resolve(migrations, "20260615_security_harden_rls_grants.sql"),
  "utf8"
)
const editor = readFileSync(resolve(migrations, "20260729_editor_role.sql"), "utf8")
const repair = readFileSync(
  resolve(migrations, "20260912090000_profiles_server_write_boundary.sql"),
  "utf8"
)
const catalogCheck = readFileSync(
  resolve(process.cwd(), "supabase/checks/profiles-write-boundary.sql"),
  "utf8"
)

function statement(input: string, pattern: RegExp): string {
  const matches = [...input.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`Expected exactly one baseline statement: ${pattern}`)
  return matches[0][0]
}

const baseline = [
  statement(source, /^CREATE TABLE IF NOT EXISTS "public"\."profiles" \([\s\S]*?^\);/gm),
  ...["profiles_pkey", "profiles_user_id_key"].map((name) =>
    statement(
      source,
      new RegExp(`^ALTER TABLE ONLY "public"\\."profiles"\\s+ADD CONSTRAINT "${name}"[^;]+;`, "gm")
    )
  ),
  statement(source, /^CREATE UNIQUE INDEX "idx_profiles_nickname_unique"[^;]+;/gm),
  statement(
    source,
    /^CREATE OR REPLACE FUNCTION "public"\."prevent_role_self_change"\(\)[\s\S]*?^\$\$;/gm
  ),
  statement(source, /^CREATE OR REPLACE TRIGGER "trg_prevent_role_self_change"[^;]+;/gm),
  ...[
    "Profiles are viewable by everyone",
    "Users can insert their own profile",
    "Users can update their own profile",
  ].map((name) =>
    statement(source, new RegExp(`^CREATE POLICY "${name}" ON "public"\\."profiles"[^;]+;`, "gm"))
  ),
  statement(source, /^ALTER TABLE "public"\."profiles" ENABLE ROW LEVEL SECURITY;/gm),
  ...["anon", "authenticated", "service_role"].map((role) =>
    statement(source, new RegExp(`^GRANT ALL ON TABLE "public"\\."profiles" TO "${role}";`, "gm"))
  ),
  statement(
    hardening,
    /^revoke update \(role, is_journalist, is_expert, grade\) on public\.profiles\s+from public, anon, authenticated;/gm
  ),
  editor,
].join("\n")

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE unexpected_profile_writer;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO PUBLIC;
  `)
}, 30_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    REVOKE unexpected_profile_writer FROM authenticated;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `)
  await db.exec(baseline)
  await db.exec(`INSERT INTO public.profiles (user_id, nickname, role) VALUES
    ('user_member', 'Member', 'user'), ('user_editor', 'Editor', 'editor'),
    ('user_admin', 'Admin', 'admin');`)
})

type Principal = "anon" | "authenticated" | "service_role" | "postgres"
async function asRole<T>(role: Principal, user: string, action: () => Promise<T>): Promise<T> {
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`)
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user }),
    ])
    return await action()
  } finally {
    // Also clear an aborted transaction after an expected permission error.
    await db.exec("ROLLBACK")
  }
}

async function snapshot() {
  return (await db.query("SELECT * FROM public.profiles ORDER BY user_id")).rows
}

async function boundaryState() {
  return (
    await db.query(`SELECT
    has_table_privilege('authenticated', 'public.profiles', 'UPDATE') AS client_update,
    has_table_privilege('anon', 'public.profiles', 'INSERT') AS anonymous_insert,
    to_regprocedure('public.prevent_role_self_change()') IS NOT NULL AS old_function,
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_prevent_role_self_change') AS old_trigger`)
  ).rows[0]
}

describe("tracked baseline reproduces the missing correction", () => {
  it("column REVOKE leaves the table grant effective", async () => {
    const { rows } = await db.query(`SELECT
      has_table_privilege('authenticated', 'public.profiles', 'UPDATE') AS table_update,
      has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') AS role_update`)
    expect(rows[0]).toEqual({ table_update: true, role_update: true })
  })

  it("a member can insert their own profile with an admin role", async () => {
    const result = await asRole("authenticated", "user_new", () =>
      db.query(`
      INSERT INTO public.profiles (user_id, nickname, role)
      VALUES ('user_new', 'New member', 'admin') RETURNING role`)
    )
    expect(result.rows).toEqual([{ role: "admin" }])
  })

  it("a member can update protected certification fields", async () => {
    const result = await asRole("authenticated", "user_member", () =>
      db.query(`
      UPDATE public.profiles SET is_expert = true, is_journalist = true
      WHERE user_id = 'user_member' RETURNING is_expert, is_journalist`)
    )
    expect(result.rows).toEqual([{ is_expert: true, is_journalist: true }])
  })

  it("the old trigger blocks service-role promotion of another member", async () => {
    await expect(
      asRole("service_role", "user_admin", () =>
        db.query(`
      UPDATE public.profiles SET role = 'editor' WHERE user_id = 'user_member'`)
      )
    ).rejects.toMatchObject({ code: "P0001" })
  })

  it("the extracted own-row RLS still rejects changing someone else", async () => {
    const result = await asRole("authenticated", "user_member", () =>
      db.query(`
      UPDATE public.profiles SET nickname = 'Hijacked' WHERE user_id = 'user_editor' RETURNING user_id`)
    )
    expect(result.rows).toEqual([])
  })
})

describe("numeric forward migration preserves the server write contract", () => {
  beforeEach(async () => {
    await db.exec(repair)
  })

  it("removes effective client writes on every column and keeps service writes and public reads", async () => {
    const { rows } = await db.query<{
      principal: string
      can_read: boolean
      can_insert: boolean
      can_update: boolean
    }>(`
      SELECT r.rolname AS principal,
        has_column_privilege(r.oid, a.attrelid, a.attnum, 'SELECT') AS can_read,
        has_column_privilege(r.oid, a.attrelid, a.attnum, 'INSERT') AS can_insert,
        has_column_privilege(r.oid, a.attrelid, a.attnum, 'UPDATE') AS can_update
      FROM pg_attribute a CROSS JOIN pg_roles r
      WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND r.rolname IN ('anon', 'authenticated', 'service_role')`)
    expect(rows.length).toBeGreaterThan(75)
    for (const row of rows)
      expect(row).toEqual({
        principal: row.principal,
        can_read: true,
        can_insert: row.principal === "service_role",
        can_update: row.principal === "service_role",
      })
    expect(await boundaryState()).toEqual({
      client_update: false,
      anonymous_insert: false,
      old_function: false,
      old_trigger: false,
    })
  })

  const blockedWrites = [
    [
      "ordinary INSERT",
      "user_new",
      "INSERT INTO public.profiles (user_id, nickname) VALUES ('user_new', 'New member')",
    ],
    [
      "role-injecting INSERT",
      "user_new",
      "INSERT INTO public.profiles (user_id, nickname, role) VALUES ('user_new', 'New member', 'admin')",
    ],
    [
      "nickname UPDATE",
      "user_member",
      "UPDATE public.profiles SET nickname = 'Changed' WHERE user_id = 'user_member'",
    ],
    [
      "role UPDATE",
      "user_member",
      "UPDATE public.profiles SET role = 'admin' WHERE user_id = 'user_member'",
    ],
    [
      "certification UPDATE",
      "user_member",
      "UPDATE public.profiles SET is_expert = true, is_journalist = true, grade = 'regular' WHERE user_id = 'user_member'",
    ],
    [
      "new UPSERT",
      "user_new",
      "INSERT INTO public.profiles (user_id, nickname) VALUES ('user_new', 'New member') ON CONFLICT (user_id) DO UPDATE SET nickname = EXCLUDED.nickname",
    ],
    [
      "existing UPSERT",
      "user_member",
      "INSERT INTO public.profiles (user_id, nickname) VALUES ('user_member', 'Changed') ON CONFLICT (user_id) DO UPDATE SET nickname = EXCLUDED.nickname",
    ],
    [
      "admin-profile self UPDATE",
      "user_admin",
      "UPDATE public.profiles SET role = 'user' WHERE user_id = 'user_admin'",
    ],
  ] as const

  describe.each(["anon", "authenticated"] as const)("%s direct writes", (role) => {
    it.each(blockedWrites)("rejects %s with SQLSTATE 42501", async (_name, user, sql) => {
      const before = await snapshot()
      await expect(asRole(role, user, () => db.query(sql))).rejects.toMatchObject({ code: "42501" })
      expect(await snapshot()).toEqual(before)
    })
  })

  it.each(["anon", "authenticated"] as const)("keeps actual public SELECT for %s", async (role) => {
    const result = await asRole(role, "user_member", () =>
      db.query("SELECT nickname FROM public.profiles ORDER BY nickname")
    )
    expect(result.rows).toEqual([
      { nickname: "Admin" },
      { nickname: "Editor" },
      { nickname: "Member" },
    ])
  })

  it("creates a default member and persists onboarding/profile edits through the service role", async () => {
    await asRole("service_role", "user_new", async () => {
      const created = await db.query(`INSERT INTO public.profiles (user_id, nickname)
        VALUES ('user_new', 'New member') RETURNING role, onboarding_completed`)
      expect(created.rows).toEqual([{ role: "user", onboarding_completed: false }])
      await db.query(`UPDATE public.profiles SET nickname = 'New nickname', bio = 'A bio',
        onboarding_completed = true, favorite_team = 'Arsenal', avatar_url = '/avatar.png'
        WHERE user_id = 'user_new'`)
      const reloaded =
        await db.query(`SELECT nickname, bio, onboarding_completed, favorite_team, avatar_url
        FROM public.profiles WHERE user_id = 'user_new'`)
      expect(reloaded.rows).toEqual([
        {
          nickname: "New nickname",
          bio: "A bio",
          onboarding_completed: true,
          favorite_team: "Arsenal",
          avatar_url: "/avatar.png",
        },
      ])
    })
  })

  it.each(["editor", "admin"])("service UPSERT preserves an omitted %s role", async (role) => {
    const result = await asRole("service_role", `user_${role}`, () =>
      db.query(
        `
      INSERT INTO public.profiles (user_id, nickname) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET nickname = EXCLUDED.nickname RETURNING role`,
        [`user_${role}`, `Updated ${role}`]
      )
    )
    expect(result.rows).toEqual([{ role }])
  })

  it.each(["service_role", "postgres"] as const)(
    "allows role transitions through %s",
    async (principal) => {
      await asRole(principal, "user_admin", async () => {
        for (const role of ["editor", "moderator", "admin", "user"]) {
          const result = await db.query(
            "UPDATE public.profiles SET role = $1 WHERE user_id = 'user_member' RETURNING role",
            [role]
          )
          expect(result.rows).toEqual([{ role }])
        }
      })
    }
  )

  it("retains certification, grade, title and deletion-marker service updates", async () => {
    const result = await asRole("service_role", "user_admin", () =>
      db.query(`
      UPDATE public.profiles SET is_expert = true, is_journalist = true, grade = 'newcomer',
        post_count = 3, display_title_id = '00000000-0000-0000-0000-000000000001', deleted_at = now()
      WHERE user_id = 'user_member' RETURNING is_expert, is_journalist, grade, post_count,
        display_title_id, deleted_at IS NOT NULL AS deleted`)
    )
    expect(result.rows).toEqual([
      {
        is_expert: true,
        is_journalist: true,
        grade: "newcomer",
        post_count: 3,
        display_title_id: "00000000-0000-0000-0000-000000000001",
        deleted: true,
      },
    ])
  })

  it.each([
    [
      "nickname uniqueness",
      "INSERT INTO public.profiles (user_id, nickname) VALUES ('user_new', 'member')",
      "23505",
    ],
    [
      "role constraint",
      "UPDATE public.profiles SET role = 'superadmin' WHERE user_id = 'user_member'",
      "23514",
    ],
  ])("retains %s", async (_name, sql, code) => {
    await expect(asRole("service_role", "user_new", () => db.query(sql))).rejects.toMatchObject({
      code,
    })
  })

  it("reapplies without changing rows, RLS policies, or unrelated grants", async () => {
    const rows = await snapshot()
    const policies = await db.query(
      "SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'"
    )
    const privileges = await db.query(
      "SELECT relacl, relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass"
    )
    await db.exec(repair)
    expect(await snapshot()).toEqual(rows)
    expect(
      (
        await db.query(
          "SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'"
        )
      ).rows
    ).toEqual(policies.rows)
    expect(
      (
        await db.query(
          "SELECT relacl, relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass"
        )
      ).rows
    ).toEqual(privileges.rows)
  })

  it("executes the catalog-only verification file and leaves no transaction or data changes", async () => {
    const rows = await snapshot()
    const results = await db.exec(catalogCheck)
    const status = results
      .flatMap((result) => result.rows)
      .find((row) => "obsolete_role_function_present" in row)
    expect(status).toEqual({
      obsolete_role_function_present: false,
      obsolete_role_trigger_present: false,
    })
    expect(await snapshot()).toEqual(rows)
    expect((await db.query("SHOW transaction_read_only")).rows).toEqual([
      { transaction_read_only: "off" },
    ])
  })
})

describe("migration atomicity and unexpected database state", () => {
  it("table REVOKE also removes the grantor's direct target-role column grants", async () => {
    await db.exec(`GRANT INSERT (nickname), UPDATE (role, is_expert)
      ON public.profiles TO anon, authenticated;`)
    const columnAcls = () =>
      db.query<{ attacl: string | null }>(`SELECT attacl::text AS attacl
      FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass
      AND attname IN ('nickname', 'role', 'is_expert') ORDER BY attname`)
    expect((await columnAcls()).rows.every((row) => row.attacl !== null)).toBe(true)

    await db.exec(repair)

    expect((await columnAcls()).rows).toEqual([
      { attacl: null },
      { attacl: null },
      { attacl: null },
    ])
    const { rows } = await db.query(`SELECT
      has_any_column_privilege('anon', 'public.profiles', 'INSERT') AS anon_insert,
      has_any_column_privilege('anon', 'public.profiles', 'UPDATE') AS anon_update,
      has_any_column_privilege('authenticated', 'public.profiles', 'INSERT') AS member_insert,
      has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE') AS member_update`)
    expect(rows).toEqual([
      { anon_insert: false, anon_update: false, member_insert: false, member_update: false },
    ])
  })

  it("does not change existing rows, policies, constraints or unrelated grants on first application", async () => {
    const rows = await snapshot()
    const metadata = async () =>
      (
        await db.query(`SELECT
      (SELECT jsonb_agg(p ORDER BY policyname) FROM pg_policies p WHERE schemaname = 'public' AND tablename = 'profiles') AS policies,
      (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass) AS constraints,
      has_table_privilege('authenticated', 'public.profiles', 'DELETE') AS delete_privilege,
      has_table_privilege('anon', 'public.profiles', 'TRUNCATE') AS truncate_privilege`)
      ).rows
    const before = await metadata()
    await db.exec(repair)
    expect(await snapshot()).toEqual(rows)
    expect(await metadata()).toEqual(before)
  })

  // Table REVOKE also removes direct column grants made by that grantor.
  // PUBLIC/inherited grants and missing prerequisites must abort, not silently widen this repair.
  it.each([
    ["PUBLIC UPDATE", "GRANT UPDATE ON public.profiles TO PUBLIC"],
    ["PUBLIC column INSERT", "GRANT INSERT (nickname) ON public.profiles TO PUBLIC"],
    [
      "inherited UPDATE",
      "GRANT UPDATE ON public.profiles TO unexpected_profile_writer; GRANT unexpected_profile_writer TO authenticated",
    ],
    ["disabled RLS", "ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY"],
    ["missing anon SELECT", "REVOKE SELECT ON public.profiles FROM anon"],
    ["missing service INSERT", "REVOKE INSERT ON public.profiles FROM service_role"],
    ["missing service UPDATE", "REVOKE UPDATE ON public.profiles FROM service_role"],
  ])("rolls back the entire correction for %s", async (_name, drift) => {
    await db.exec(drift)
    const before = await boundaryState()
    const rows = await snapshot()
    try {
      await expect(db.exec(repair)).rejects.toMatchObject({ code: "P0001" })
    } finally {
      await db.exec("ROLLBACK")
    }
    expect(await boundaryState()).toEqual(before)
    expect(await snapshot()).toEqual(rows)
  })
})
