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
      return existingProfile.deleted_at ? null : existingProfile
    }

    if (fetchError && fetchError.code !== "PGRST116") return null

    // Profile does not exist; do not overwrite an existing or deleted profile.
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
      if (insertError.code !== "23505") return null
      const { data: raced, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single()
      return error || raced?.deleted_at ? null : raced
    }

    return newProfile
  } catch (error) {
    // Clerk middleware가 실행되지 않은 경로에서 호출된 경우 (예: static files)
    // 조용히 null 반환
    return null
  }
}
