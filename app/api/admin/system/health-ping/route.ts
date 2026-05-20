import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"
import { clerkClient } from "@clerk/nextjs/server"

export const dynamic = "force-dynamic"

interface Check {
  ok: boolean
  latencyMs: number
  error: string | null
}

/**
 * GET /api/admin/system/health-ping
 *
 * 메인 앱이 직접 의존하는 외부 서비스(Supabase, Clerk)의 응답 상태를 측정.
 * 어드민 시스템 페이지의 health strip 이 SWR 로 폴링한다.
 */
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const checks: Record<string, Check> = {}

    // Supabase — 가벼운 head count
    {
      const t = Date.now()
      try {
        const { error } = await supabase
          .from("profiles")
          .select("user_id", { head: true, count: "exact" })
        checks.supabase = {
          ok: !error,
          latencyMs: Date.now() - t,
          error: error?.message ?? null,
        }
      } catch (e) {
        checks.supabase = {
          ok: false,
          latencyMs: Date.now() - t,
          error: e instanceof Error ? e.message : "unknown error",
        }
      }
    }

    // Clerk — 유저 1명 조회로 backend API 응답 확인
    {
      const t = Date.now()
      try {
        const client = await clerkClient()
        await client.users.getUserList({ limit: 1 })
        checks.clerk = { ok: true, latencyMs: Date.now() - t, error: null }
      } catch (e) {
        checks.clerk = {
          ok: false,
          latencyMs: Date.now() - t,
          error: e instanceof Error ? e.message : "unknown error",
        }
      }
    }

    return NextResponse.json({ checks, checkedAt: new Date().toISOString() })
  } catch (error) {
    return apiError("헬스 체크 실패", 500, error)
  }
}
