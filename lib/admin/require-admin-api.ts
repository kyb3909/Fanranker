import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ADMIN_ROLE, requireRoleApi } from "@/lib/admin/roles"

interface AdminAuth {
  userId: string
  supabase: ReturnType<typeof createServiceRoleClient>
}

/**
 * Verify admin access in API routes.
 * Returns admin userId and service-role supabase client, or a NextResponse error.
 *
 * 판정 엔진은 lib/admin/roles.ts 단일 소스 (2026-08-08 감사 P2-6 — 여기서
 * role === "admin" 을 따로 하드코딩하던 것을 위임으로 교체. 시그니처·상태코드·
 * 에러 메시지는 기존과 동일).
 */
export async function requireAdminApi(): Promise<AdminAuth | NextResponse> {
  const result = await requireRoleApi([ADMIN_ROLE], "관리자 권한이 필요합니다.")
  if (result instanceof NextResponse) return result
  return { userId: result.userId, supabase: result.supabase }
}

export function isErrorResponse(result: AdminAuth | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
