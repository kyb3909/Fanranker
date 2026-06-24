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

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"

/**
 * Creates an anonymous Supabase client (no authentication)
 * Use this for public data access without RLS restrictions
 */
let cachedAnonClient: ReturnType<typeof createSupabaseClient> | null = null

export function createAnonClient() {
  // 브라우저에서는 단일 인스턴스를 재사용한다. createAnonClient 를 여러 곳
  // (메타버스 RoomChannel + IndoorPresenceChannel 등)에서 호출하면 GoTrueClient 가
  // 같은 storage key 로 중복 생성돼 "Multiple GoTrueClient instances" 경고 +
  // Realtime auth 동시성 문제(presence sync 불안정 → 다른 유저가 안 보임)를 일으킨다.
  // 서버(SSR/route)에서는 요청 간 격리를 위해 캐시하지 않고 매번 새로 만든다.
  if (typeof window === "undefined") {
    return createSupabaseClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  }
  if (!cachedAnonClient) {
    cachedAnonClient = createSupabaseClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  }
  return cachedAnonClient
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
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => {
        const token = await getToken()
        return token ?? null
      },
    }
  )
}
