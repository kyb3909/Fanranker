-- Preserve the server-only profiles write boundary recorded in the original
-- 20260904d_profiles_role_column_privilege.sql. That historical file is kept
-- unchanged; this numeric version is discoverable by the Supabase CLI.
--
-- The original trigger inspects the target row's OLD.role, not the caller's
-- role. It blocks legitimate service-role promotions and does not protect
-- INSERT. Revoke browser-role writes before removing that trigger.
--
-- Table REVOKE also removes the grantor's direct target-role column grants.
-- Do not broaden the correction to unexpected PUBLIC or inherited grants.
-- If any table or column access still permits client writes, fail the whole
-- transaction for review.
-- No profile rows, RLS policies, SELECT grants, or service-role grants change.
-- Reapplying this migration after the historical correction is safe.

BEGIN;

REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_role_self_change ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_self_change();

DO $profiles_write_boundary$
DECLARE
  principal text;
BEGIN
  FOREACH principal IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF has_table_privilege(principal, 'public.profiles', 'INSERT')
       OR has_table_privilege(principal, 'public.profiles', 'UPDATE')
       OR has_any_column_privilege(principal, 'public.profiles', 'INSERT')
       OR has_any_column_privilege(principal, 'public.profiles', 'UPDATE') THEN
      RAISE EXCEPTION
        'profiles write boundary postcondition failed: % retains INSERT or UPDATE via table, column, PUBLIC, or inherited grants',
        principal;
    END IF;
  END LOOP;

  FOREACH principal IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF NOT has_table_privilege(principal, 'public.profiles', 'SELECT') THEN
      RAISE EXCEPTION
        'profiles write boundary postcondition failed: % must retain SELECT',
        principal;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.profiles', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION
      'profiles write boundary postcondition failed: service_role must retain INSERT and UPDATE';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION
      'profiles write boundary postcondition failed: profiles RLS must remain enabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_prevent_role_self_change'
  ) OR to_regprocedure('public.prevent_role_self_change()') IS NOT NULL THEN
    RAISE EXCEPTION
      'profiles write boundary postcondition failed: obsolete role trigger and function must be absent';
  END IF;
END;
$profiles_write_boundary$;

COMMIT;
