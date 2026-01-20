/**
 * Admin Utilities
 * Helper functions for admin role checking
 */

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Check if current user is an admin
 * @returns true if user is admin, false otherwise
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { userId } = await auth()
    if (!userId) return false

    const supabase = await createClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single()

    if (error || !profile) return false
    return profile.is_admin === true
  } catch (error) {
    console.error('Failed to check admin status:', error)
    return false
  }
}

/**
 * Require admin access - throws error if not admin
 * Use in API routes or Server Components
 */
export async function requireAdmin() {
  const admin = await isAdmin()
  if (!admin) {
    throw new Error('관리자 권한이 필요합니다.')
  }
}
