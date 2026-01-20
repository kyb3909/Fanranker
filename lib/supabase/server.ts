/**
 * Supabase Server Client with Clerk Integration (2025 Best Practice)
 *
 * Use this client in:
 * - Server Components
 * - Server Actions
 * - Route Handlers (API routes)
 *
 * This uses the new Third-Party Auth integration with Clerk.
 * Authentication is handled via Clerk's auth() function.
 *
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 * @see https://clerk.com/docs/guides/development/integrations/databases/supabase
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

/**
 * Creates an anonymous Supabase server client (no authentication)
 * Use this for public data access without RLS restrictions
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/**
 * Creates an authenticated Supabase server client with Clerk session token
 *
 * @returns Supabase client configured with Clerk authentication
 *
 * @example
 * ```tsx
 * // In a Server Component or Server Action:
 * const supabase = await createAuthClient()
 * const { data } = await supabase.from('posts').select('*')
 * ```
 */
export async function createAuthClient() {
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set')
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is not set')
  }

  const { getToken } = await auth()

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => {
        try {
          const token = await getToken()
          return token ?? null
        } catch (error) {
          console.error('Failed to get Clerk token:', error)
          return null
        }
      },
    }
  )
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use createAuthClient() for authenticated requests
 *             or createAnonClient() for public access
 */
export async function createClient() {
  return createAuthClient()
}
