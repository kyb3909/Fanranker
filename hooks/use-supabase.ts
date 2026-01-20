/**
 * useSupabase Hook - Clerk + Supabase Integration (2025 Best Practice)
 *
 * This hook provides an authenticated Supabase client in Client Components.
 * It automatically uses Clerk's session token for authentication.
 *
 * @example
 * ```tsx
 * 'use client'
 *
 * import { useSupabase } from '@/hooks/use-supabase'
 *
 * export function MyComponent() {
 *   const { supabase, isLoaded, isSignedIn } = useSupabase()
 *
 *   useEffect(() => {
 *     if (!isLoaded || !isSignedIn) return
 *
 *     async function fetchData() {
 *       const { data, error } = await supabase.from('posts').select('*')
 *       // handle data...
 *     }
 *     fetchData()
 *   }, [supabase, isLoaded, isSignedIn])
 *
 *   if (!isLoaded) return <div>Loading...</div>
 *   if (!isSignedIn) return <div>Please sign in</div>
 *
 *   return <div>...</div>
 * }
 * ```
 */

'use client'

import { useMemo } from 'react'
import { useSession, useAuth } from '@clerk/nextjs'
import { createClient } from '@supabase/supabase-js'

/**
 * Creates and returns an authenticated Supabase client using Clerk session tokens
 *
 * @returns Object containing:
 *   - supabase: Authenticated Supabase client instance
 *   - isLoaded: Whether Clerk has finished loading
 *   - isSignedIn: Whether user is currently signed in
 *   - userId: Current user's Clerk ID (matches auth.jwt()->>'sub' in RLS)
 */
export function useSupabase() {
  const { session, isLoaded: sessionLoaded } = useSession()
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth()

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        accessToken: async () => {
          // Get Clerk session token for Supabase authentication
          const token = await session?.getToken()
          return token ?? null
        },
      }
    )
  }, [session])

  return {
    supabase,
    isLoaded: sessionLoaded && authLoaded,
    isSignedIn: isSignedIn ?? false,
    userId: userId ?? null,
  }
}

/**
 * Creates an anonymous Supabase client (no authentication)
 * Use this for public data that doesn't require user authentication
 *
 * @example
 * ```tsx
 * const supabase = useAnonSupabase()
 * // Access public data without RLS user restrictions
 * const { data } = await supabase.from('public_posts').select('*')
 * ```
 */
export function useAnonSupabase() {
  return useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
  }, [])
}
