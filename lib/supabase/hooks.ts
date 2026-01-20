/**
 * Supabase React Hooks with Clerk Integration (2025 Best Practice)
 *
 * These hooks provide easy access to authenticated Supabase clients
 * in React Client Components using Clerk's session management.
 *
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 * @see https://clerk.com/docs/guides/development/integrations/databases/supabase
 */

'use client'

import { useSession } from '@clerk/nextjs'
import { useMemo, useCallback } from 'react'
import { createAuthClient, createAnonClient } from './client'

/**
 * Hook to get an authenticated Supabase client
 *
 * Automatically uses Clerk's session token for authentication.
 * The client is memoized and recreated when the session changes.
 *
 * @returns Authenticated Supabase client (or anonymous if not signed in)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const supabase = useSupabase()
 *
 *   useEffect(() => {
 *     async function fetchData() {
 *       const { data, error } = await supabase
 *         .from('posts')
 *         .select('*')
 *       // RLS automatically filters by user_id
 *     }
 *     fetchData()
 *   }, [supabase])
 * }
 * ```
 */
export function useSupabase() {
  const { session, isSignedIn } = useSession()

  const getToken = useCallback(async () => {
    if (!session) return null
    return session.getToken() ?? null
  }, [session])

  const client = useMemo(() => {
    if (!isSignedIn) {
      return createAnonClient()
    }
    return createAuthClient(getToken)
  }, [isSignedIn, getToken])

  return client
}

/**
 * Hook to get an anonymous Supabase client
 *
 * Use this for public data that doesn't require authentication.
 * The client is memoized for performance.
 *
 * @returns Anonymous Supabase client
 *
 * @example
 * ```tsx
 * function PublicComponent() {
 *   const supabase = useSupabaseAnon()
 *
 *   useEffect(() => {
 *     async function fetchPublicData() {
 *       const { data } = await supabase
 *         .from('public_posts')
 *         .select('*')
 *     }
 *     fetchPublicData()
 *   }, [supabase])
 * }
 * ```
 */
export function useSupabaseAnon() {
  const client = useMemo(() => createAnonClient(), [])
  return client
}

/**
 * Hook to get the current user's Clerk ID
 *
 * Useful for client-side operations that need the user ID.
 *
 * @returns User ID string or null if not signed in
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const userId = useClerkUserId()
 *   // userId matches auth.jwt()->>'sub' in Supabase RLS
 * }
 * ```
 */
export function useClerkUserId() {
  const { session } = useSession()
  return session?.user?.id ?? null
}
