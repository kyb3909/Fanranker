/**
 * Clerk + Supabase RLS Integration (2025 Best Practice)
 *
 * This migration sets up Row Level Security (RLS) policies for Clerk authentication.
 *
 * IMPORTANT: Before running this migration, ensure you have:
 * 1. Configured Clerk for Supabase at: https://dashboard.clerk.com/setup/supabase
 * 2. Added Clerk as Third-Party Auth provider in Supabase Dashboard
 *    - Navigate to: Authentication > Third-Party Auth > Add Clerk
 *
 * Key Differences from Supabase Auth:
 * - Clerk uses TEXT user IDs (e.g., "user_2abc123"), not UUIDs
 * - Use auth.jwt()->>'sub' to get Clerk user ID in RLS policies
 * - auth.uid() does NOT work with Clerk - always use auth.jwt()->>'sub'
 *
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 */

-- ============================================================
-- Step 1: Verify posts table uses user_id (already TEXT from 002)
-- ============================================================

-- Note: The posts table already uses user_id TEXT from 002_create_categories_posts.sql
-- This migration just ensures RLS policies are correct for Clerk
-- No table modifications needed - user_id is already TEXT

-- ============================================================
-- Step 2: Ensure RLS is enabled (may already be enabled from 002)
-- ============================================================

-- Note: RLS policies for posts are already set in 002_create_categories_posts.sql
-- This step only ensures embeds table has RLS if it exists

-- Enable RLS on embeds table if it exists (from create_posts_with_embeds.sql)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'embeds') THEN
ALTER TABLE embeds ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================================
-- Step 3: RLS Policies for embeds table (if exists)
-- ============================================================

-- Policy: Anyone can read embeds (public read access)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'embeds') THEN
    -- Only create policy if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'embeds' 
      AND policyname = 'embeds_public_read'
    ) THEN
CREATE POLICY "embeds_public_read"
  ON embeds
  FOR SELECT
  TO authenticated, anon
  USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================
-- Step 4: Helper function to get current Clerk user ID
-- ============================================================

-- Convenience function to get current Clerk user ID
CREATE OR REPLACE FUNCTION clerk_user_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT auth.jwt()->>'sub'
$$;

-- ============================================================
-- Example: Additional RLS patterns for Clerk
-- ============================================================

-- Example 1: Organization-based access (if using Clerk Organizations)
-- CREATE POLICY "org_members_only"
--   ON org_documents
--   FOR ALL
--   TO authenticated
--   USING (
--     organization_id = COALESCE(
--       auth.jwt()->>'org_id',
--       auth.jwt()->'o'->>'id'
--     )
--   );

-- Example 2: Check organization role
-- CREATE POLICY "org_admin_only"
--   ON admin_settings
--   FOR ALL
--   TO authenticated
--   USING (
--     (auth.jwt()->>'org_role' = 'org:admin')
--     OR (auth.jwt()->'o'->>'rol' = 'admin')
--   );

-- Example 3: Require 2FA verification
-- CREATE POLICY "require_2fa"
--   ON sensitive_data
--   FOR SELECT
--   TO authenticated
--   USING (
--     (auth.jwt()->'fva'->>1)::int != -1
--   );

-- ============================================================
-- Verification queries (run after migration)
-- ============================================================

-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- List all RLS policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public';

-- Test Clerk user ID extraction (requires authenticated request):
-- SELECT clerk_user_id();
