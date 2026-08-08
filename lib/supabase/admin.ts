/**
 * Admin Utilities
 * Helper functions for admin role checking
 *
 * 판정은 lib/admin/roles.ts 단일 소스에 위임 (2026-08-08 감사 P2-6 — 여기서
 * role 조회와 === "admin" 비교를 따로 하드코딩하던 3중 정의 해소).
 * 기존과 동일하게 실패·예외는 전부 false (권한은 fail-closed).
 */

import { ADMIN_ROLE, getCurrentRole } from "@/lib/admin/roles"

/**
 * Check if current user is an admin
 * @returns true if user is admin, false otherwise
 */
async function isAdmin(): Promise<boolean> {
  return (await getCurrentRole()) === ADMIN_ROLE
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
