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

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { auth, currentUser } from "@clerk/nextjs/server"

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
 * Creates a Service Role Supabase client (bypasses RLS)
 *
 * ⚠️ WARNING: This client bypasses all RLS policies!
 * Only use in API routes where you manually verify user_id.
 *
 * @returns Supabase client with service role (RLS bypassed)
 *
 * @example
 * ```tsx
 * // In an API route:
 * const user = await currentUser()
 * if (!user) return unauthorized()
 *
 * const supabase = createServiceRoleClient()
 * // Now you can insert/update, but MUST verify user_id in your code!
 * await supabase.from('post_votes').insert({
 *   post_id: postId,
 *   user_id: user.id, // ← Always verify this matches currentUser().id
 *   vote_type: 'up'
 * })
 * ```
 */
export function createServiceRoleClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const error = new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set")
    console.error("[Supabase] Missing environment variable:", error.message)
    throw error
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
    console.error("[Supabase] Missing environment variable:", error.message)
    console.error("[Supabase] Please add SUPABASE_SERVICE_ROLE_KEY to your .env.local file")
    console.error(
      "[Supabase] You can find it in Supabase Dashboard > Settings > API > service_role key"
    )
    throw error
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
