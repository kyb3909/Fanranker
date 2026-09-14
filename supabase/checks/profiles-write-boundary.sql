-- Read-only verification of the profiles server-write boundary.
-- Run against the explicitly selected database; this file does not connect,
-- apply migrations, repair a migration ledger, or read any profile rows.
--
-- Expected: anon/authenticated INSERT and UPDATE are false at both the table
-- and every column; SELECT is true. service_role SELECT/INSERT/UPDATE are true.
-- RLS stays enabled. The obsolete role trigger and its no-argument function
-- are absent. DELETE and other privileges are reported, not modified.
-- Role memberships and effective grants reveal unexpected inheritance.

BEGIN READ ONLY;

-- Relation ownership, RLS, and direct ACL. No application data is selected.
SELECT
  c.oid::regclass AS relation,
  pg_get_userbyid(c.relowner) AS owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.relacl AS direct_table_acl
FROM pg_catalog.pg_class AS c
WHERE c.oid = 'public.profiles'::regclass;

-- Effective privileges include direct, PUBLIC, and inherited grants.
SELECT
  r.rolname AS principal,
  r.rolsuper AS is_superuser,
  r.rolbypassrls AS bypasses_rls,
  has_table_privilege(r.oid, 'public.profiles', 'SELECT') AS can_select,
  has_table_privilege(r.oid, 'public.profiles', 'INSERT') AS can_insert,
  has_table_privilege(r.oid, 'public.profiles', 'UPDATE') AS can_update,
  has_table_privilege(r.oid, 'public.profiles', 'DELETE') AS can_delete,
  has_table_privilege(r.oid, 'public.profiles', 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.oid, 'public.profiles', 'REFERENCES') AS can_reference,
  has_table_privilege(r.oid, 'public.profiles', 'TRIGGER') AS can_create_trigger,
  has_any_column_privilege(r.oid, 'public.profiles', 'INSERT') AS can_insert_any_column,
  has_any_column_privilege(r.oid, 'public.profiles', 'UPDATE') AS can_update_any_column
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

-- Every live column, including any grants not represented by table privileges.
SELECT
  r.rolname AS principal,
  a.attnum AS column_number,
  a.attname AS column_name,
  has_column_privilege(r.oid, a.attrelid, a.attnum, 'SELECT') AS can_select,
  has_column_privilege(r.oid, a.attrelid, a.attnum, 'INSERT') AS can_insert,
  has_column_privilege(r.oid, a.attrelid, a.attnum, 'UPDATE') AS can_update,
  has_column_privilege(r.oid, a.attrelid, a.attnum, 'REFERENCES') AS can_reference,
  a.attacl AS direct_column_acl
FROM pg_catalog.pg_attribute AS a
CROSS JOIN pg_catalog.pg_roles AS r
WHERE a.attrelid = 'public.profiles'::regclass
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname, a.attnum;

-- RLS policy metadata only: verify that public SELECT and existing policies remain.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- List trigger identities without exposing trigger arguments or function bodies.
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_mode,
  t.tgtype AS trigger_type,
  t.tgfoid::regprocedure AS trigger_function
FROM pg_catalog.pg_trigger AS t
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT
  to_regprocedure('public.prevent_role_self_change()') IS NOT NULL
    AS obsolete_role_function_present,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_prevent_role_self_change'
  ) AS obsolete_role_trigger_present;

-- Direct and transitive memberships; USAGE reports currently inherited access.
SELECT
  principal.rolname AS principal,
  inherited.rolname AS member_of,
  pg_has_role(principal.oid, inherited.oid, 'USAGE') AS privileges_available_without_set_role,
  inherited.rolsuper AS inherited_role_is_superuser,
  inherited.rolbypassrls AS inherited_role_bypasses_rls
FROM pg_catalog.pg_roles AS principal
CROSS JOIN pg_catalog.pg_roles AS inherited
WHERE principal.rolname IN ('anon', 'authenticated', 'service_role')
  AND principal.oid <> inherited.oid
  AND pg_has_role(principal.oid, inherited.oid, 'MEMBER')
ORDER BY principal.rolname, inherited.rolname;

ROLLBACK;
