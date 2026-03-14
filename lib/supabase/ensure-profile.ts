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

import { auth, currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

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
  try {
    const { userId } = await auth()

    if (!userId) {
      return null
    }

    // Service Role 클라이언트로 RLS 우회
    const supabase = createServiceRoleClient()

    // Check if profile exists (include onboarding_completed for middleware check)
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("*, onboarding_completed")
      .eq("user_id", userId)
      .single()

    if (existingProfile) {
      return existingProfile
    }

    // Profile doesn't exist, create it
    const user = await currentUser()

    if (!user) {
      return null
    }

    const nickname = `User_${userId.slice(-8)}`

    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        user_id: userId,
        nickname: nickname,
        avatar_url: user.imageUrl,
      })
      .select()
      .single()

    if (insertError) {
      console.error("Failed to create profile:", insertError)
      // If insert failed due to RLS or other issues, try upsert
      const { data: upsertProfile, error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: userId,
            nickname: nickname,
            avatar_url: user.imageUrl,
          },
          { onConflict: "user_id" }
        )
        .select()
        .single()

      if (upsertError) {
        console.error("Failed to upsert profile:", upsertError)
        return null
      }

      return upsertProfile
    }

    return newProfile
  } catch (error) {
    // Clerk middleware가 실행되지 않은 경로에서 호출된 경우 (예: static files)
    // 조용히 null 반환
    return null
  }
}

/**
 * Server Action to sync current user's profile
 * Call this after user updates their Clerk profile
 */
export async function syncProfile() {
  "use server"

  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "Not authenticated" }
  }

  const user = await currentUser()

  if (!user) {
    return { success: false, error: "User not found" }
  }

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        nickname: `User_${userId.slice(-8)}`,
        avatar_url: user.imageUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, profile: data }
}
