/**
 * Supabase + Clerk Integration (2025 Best Practice)
 *
 * This module provides a complete integration between Supabase and Clerk
 * using the new Third-Party Auth method (recommended as of April 2025).
 *
 * Setup Checklist:
 * 1. Configure Clerk Dashboard: https://dashboard.clerk.com/setup/supabase
 * 2. Configure Supabase Dashboard: Authentication > Third-Party Auth > Add Clerk
 * 3. Run the RLS migration: supabase/migrations/20250115_clerk_rls_policies.sql
 * 4. Generate types: npx supabase gen types typescript
 *
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 * @see https://clerk.com/docs/guides/development/integrations/databases/supabase
 */

// Server-side clients (Server Components, Server Actions, Route Handlers)
export {
  createAuthClient as createServerAuthClient,
  createAnonClient as createServerAnonClient,
  createClient, // Legacy alias
} from './server'

// Client-side clients (Client Components)
export {
  createAuthClient as createBrowserAuthClient,
  createAnonClient as createBrowserAnonClient,
} from './client'

// React Hooks
export {
  useSupabase,
  useSupabaseAnon,
  useClerkUserId,
} from './hooks'

// Types
export type {
  ClerkUserOwned,
  ClerkOrgOwned,
  ClerkJwtClaims,
  TypedSupabaseClient,
  WithAutoUserId,
  WithAutoOrgId,
} from './types'

// Database Types (auto-generated from Supabase schema)
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Json,
} from './database.types'
