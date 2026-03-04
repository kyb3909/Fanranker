import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { reportId } = await params
    const { supabase } = auth

    const { data, error } = await supabase
      .from("weekly_analytics_reports")
      .select("*")
      .eq("id", reportId)
      .single()

    if (error || !data) {
      return apiError("리포트를 찾을 수 없습니다", 404, error)
    }

    return NextResponse.json({ report: data })
  } catch (error) {
    return apiError("리포트 상세 조회 실패", 500, error)
  }
}
