/**
 * ProfileSync - Server Component
 *
 * Automatically ensures Clerk user has a profile in Supabase.
 * Place this in the root layout to sync on every page load.
 *
 * This component renders nothing but handles the side effect
 * of creating/updating the user's Supabase profile.
 */

import { ensureProfile } from '@/lib/supabase/ensure-profile'

export async function ProfileSync() {
  // This will create the profile if it doesn't exist
  // or return the existing one
  await ensureProfile()

  // This component renders nothing
  return null
}
