/**
 * Supabase Browser Client with Clerk Integration (2025 Best Practice)
 *
 * This client uses the new Third-Party Auth integration method.
 * The deprecated JWT template approach was removed as of April 2025.
 *
 * IMPORTANT: Before using this client, configure:
 * 1. Clerk Dashboard: https://dashboard.clerk.com/setup/supabase
 *    - This automatically adds the 'role: authenticated' claim to session tokens
 * 2. Supabase Dashboard: Add Clerk as Third-Party Auth provider
 *    - Navigate to: Authentication > Third-Party Auth > Add Clerk
 *
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 * @see https://clerk.com/docs/guides/development/integrations/databases/supabase
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Creates an anonymous Supabase client (no authentication)
 * Use this for public data access without RLS restrictions
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}

/**
 * Creates an authenticated Supabase client with Clerk session token
 *
 * @param getToken - Function to get Clerk session token (from useSession hook)
 * @returns Supabase client configured with Clerk authentication
 *
 * @example
 * ```tsx
 * // In a Client Component:
 * const { session } = useSession()
 * const supabase = createAuthClient(() => session?.getToken() ?? null)
 * ```
 */
export function createAuthClient(getToken: () => Promise<string | null> | string | null) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => {
        const token = await getToken()
        return token ?? null
      },
    }
  )
}
