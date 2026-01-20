-- ============================================
-- Clerk + Supabase RLS Integration (2025 Best Practice)
-- ============================================
-- This migration sets up Row Level Security policies
-- that work with Clerk's Third-Party Auth integration.
--
-- Key difference from Supabase Auth:
-- - Use auth.jwt()->>'sub' instead of auth.uid()
-- - Clerk uses string-based user IDs, not UUIDs
--
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================

-- Helper function to get current Clerk user ID
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::text;
$$ LANGUAGE SQL STABLE;

-- Helper function to get current user's organization ID (if using Clerk Organizations)
CREATE OR REPLACE FUNCTION public.requesting_org_id()
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->'o'->>'id',
    ''
  )::text;
$$ LANGUAGE SQL STABLE;

-- Helper function to check if user has specific organization role
CREATE OR REPLACE FUNCTION public.has_org_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT (
    current_setting('request.jwt.claims', true)::json->'o'->>'rol'
  ) = required_role;
$$ LANGUAGE SQL STABLE;

-- ============================================
-- Example: User-owned data table with RLS
-- ============================================
-- Copy and modify for your use case:

/*
CREATE TABLE IF NOT EXISTS public.user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT public.requesting_user_id(),
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own posts
CREATE POLICY "Users can view own posts"
  ON public.user_posts FOR SELECT
  USING (user_id = public.requesting_user_id());

-- Users can only create their own posts
CREATE POLICY "Users can insert own posts"
  ON public.user_posts FOR INSERT
  WITH CHECK (user_id = public.requesting_user_id());

-- Users can only update their own posts
CREATE POLICY "Users can update own posts"
  ON public.user_posts FOR UPDATE
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());

-- Users can only delete their own posts
CREATE POLICY "Users can delete own posts"
  ON public.user_posts FOR DELETE
  USING (user_id = public.requesting_user_id());
*/

-- ============================================
-- Example: Public read, authenticated write
-- ============================================

/*
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT public.requesting_user_id(),
  title TEXT NOT NULL,
  content TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read public posts
CREATE POLICY "Anyone can view public posts"
  ON public.community_posts FOR SELECT
  USING (is_public = true);

-- Authenticated users can also see their own private posts
CREATE POLICY "Users can view own posts"
  ON public.community_posts FOR SELECT
  USING (user_id = public.requesting_user_id());

-- Only authenticated users can create posts
CREATE POLICY "Authenticated users can create posts"
  ON public.community_posts FOR INSERT
  WITH CHECK (public.requesting_user_id() IS NOT NULL);

-- Users can only update their own posts
CREATE POLICY "Users can update own posts"
  ON public.community_posts FOR UPDATE
  USING (user_id = public.requesting_user_id());
*/

-- ============================================
-- Example: Organization-based multi-tenancy
-- ============================================

/*
CREATE TABLE IF NOT EXISTS public.org_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT public.requesting_org_id(),
  created_by TEXT NOT NULL DEFAULT public.requesting_user_id(),
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

-- Organization members can view their org's documents
CREATE POLICY "Org members can view documents"
  ON public.org_documents FOR SELECT
  USING (organization_id = public.requesting_org_id());

-- Organization members can create documents
CREATE POLICY "Org members can create documents"
  ON public.org_documents FOR INSERT
  WITH CHECK (organization_id = public.requesting_org_id());

-- Only org admins can update documents
CREATE POLICY "Org admins can update documents"
  ON public.org_documents FOR UPDATE
  USING (
    organization_id = public.requesting_org_id()
    AND public.has_org_role('org:admin')
  );

-- Only org admins can delete documents
CREATE POLICY "Org admins can delete documents"
  ON public.org_documents FOR DELETE
  USING (
    organization_id = public.requesting_org_id()
    AND public.has_org_role('org:admin')
  );
*/
