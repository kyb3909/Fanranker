/**
 * Ensure Profile Exists - Auto-create profile for Clerk users
 *
 * Since Clerk Third-Party Auth doesn't trigger Supabase database triggers,
 * we need to ensure the profile exists on first access.
 *
 * Use this in:
 * - Layout components (to ensure profile on page load)
 * - Server Actions (before user operations)
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side: Ensure current user has a profile in Supabase
 *
 * @returns Profile data or null if not authenticated
 *
 * @example
 * ```tsx
 * // In a Server Component or Server Action
 * const profile = await ensureProfile()
 * if (!profile) {
 *   redirect('/sign-in')
 * }
 * ```
 */
export async function ensureProfile() {
  const { userId, getToken } = await auth()

  if (!userId) {
    return null
  }

  // Create authenticated Supabase client
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => {
        return (await getToken()) ?? null
      },
    }
  )

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (existingProfile) {
    return existingProfile
  }

  // Profile doesn't exist, create it
  const user = await currentUser()

  if (!user) {
    return null
  }

  const nickname =
    user.username ||
    user.firstName ||
    `User_${userId.slice(-8)}`

  const { data: newProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      nickname: nickname,
      avatar_url: user.imageUrl,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Failed to create profile:', insertError)
    // If insert failed due to RLS or other issues, try upsert
    const { data: upsertProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          nickname: nickname,
          avatar_url: user.imageUrl,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (upsertError) {
      console.error('Failed to upsert profile:', upsertError)
      return null
    }

    return upsertProfile
  }

  return newProfile
}

/**
 * Server Action to sync current user's profile
 * Call this after user updates their Clerk profile
 */
export async function syncProfile() {
  'use server'

  const { userId, getToken } = await auth()

  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const user = await currentUser()

  if (!user) {
    return { success: false, error: 'User not found' }
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => {
        return (await getToken()) ?? null
      },
    }
  )

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        nickname: user.username || user.firstName || `User_${userId.slice(-8)}`,
        avatar_url: user.imageUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, profile: data }
}
