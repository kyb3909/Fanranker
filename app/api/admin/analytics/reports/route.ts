import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { supabase } = auth

    const { data, error } = await supabase
      .from("weekly_analytics_reports")
      .select("id, period_start, period_end, summary, generated_by, generated_at")
      .order("period_start", { ascending: false })
      .limit(52)

    if (error) {
      return apiError("리포트 목록 조회 실패", 500, error)
    }

    return NextResponse.json({ reports: data ?? [] })
  } catch (error) {
    return apiError("리포트 목록 조회 실패", 500, error)
  }
}
