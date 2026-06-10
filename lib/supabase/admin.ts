/**
 * Admin Utilities
 * Helper functions for admin role checking
 */

import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Check if current user is an admin
 * @returns true if user is admin, false otherwise
 */
async function isAdmin(): Promise<boolean> {
  try {
    const { userId } = await auth()
    if (!userId) return false

    const supabase = createServiceRoleClient()
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .single()

    if (error || !profile) return false
    return profile.role === "admin"
  } catch (error) {
    console.error("Failed to check admin status:", error)
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
    throw new Error("관리자 권한이 필요합니다.")
  }
}
