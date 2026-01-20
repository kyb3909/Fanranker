/**
 * Supabase Database Types for Clerk Integration
 *
 * These types are designed to work with Clerk's string-based user IDs.
 * Generate full types using: npx supabase gen types typescript
 *
 * @see https://supabase.com/docs/guides/api/generating-types
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Base interface for tables with Clerk user ownership
 */
export interface ClerkUserOwned {
  /** Clerk user ID (string format: user_xxx) */
  user_id: string
  created_at: string
  updated_at?: string
}

/**
 * Base interface for tables with Clerk organization ownership
 */
export interface ClerkOrgOwned {
  /** Clerk organization ID (string format: org_xxx) */
  organization_id: string
  /** Clerk user ID of the creator */
  created_by: string
  created_at: string
}

/**
 * Example: User post type with Clerk integration
 */
export interface UserPost extends ClerkUserOwned {
  id: string
  title: string
  content: string | null
}

/**
 * Example: Organization document type with Clerk integration
 */
export interface OrgDocument extends ClerkOrgOwned {
  id: string
  title: string
  content: string | null
}

/**
 * Clerk JWT claims structure available in Supabase RLS
 *
 * Access via: auth.jwt()->>'claim_name'
 */
export interface ClerkJwtClaims {
  /** User ID (sub claim) */
  sub: string
  /** User's primary email */
  email?: string
  /** User's full name */
  name?: string
  /** Session ID */
  sid?: string
  /** Organization object (if using Clerk Organizations) */
  o?: {
    /** Organization ID */
    id: string
    /** Organization slug */
    slg: string
    /** User's role in the organization */
    rol: string
  }
  /** Factor verification array (for MFA) */
  fva?: Array<number>
}

/**
 * Type helper for Supabase client with your database schema
 *
 * Usage:
 * 1. Generate types: npx supabase gen types typescript --project-id <your-project-id> > lib/supabase/database.types.ts
 * 2. Import and use: TypedSupabaseClient<Database>
 */
export type TypedSupabaseClient<T> = SupabaseClient<T>

/**
 * Helper type for insert operations with automatic user_id
 *
 * @example
 * type NewPost = WithAutoUserId<UserPost>
 * // user_id becomes optional since it's set by default in DB
 */
export type WithAutoUserId<T extends ClerkUserOwned> = Omit<T, 'user_id' | 'created_at' | 'updated_at'> & {
  user_id?: string
  created_at?: string
  updated_at?: string
}

/**
 * Helper type for insert operations with automatic org_id
 */
export type WithAutoOrgId<T extends ClerkOrgOwned> = Omit<T, 'organization_id' | 'created_by' | 'created_at'> & {
  organization_id?: string
  created_by?: string
  created_at?: string
}
