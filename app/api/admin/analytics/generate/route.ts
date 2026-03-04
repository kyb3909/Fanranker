import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchWeeklyReport } from "@/lib/ga4/fetch-weekly-report"

const bodySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest("periodStart, periodEnd (YYYY-MM-DD) 형식이 필요합니다")
    }

    const { periodStart, periodEnd } = parsed.data

    // 날짜 유효성
    if (new Date(periodStart) >= new Date(periodEnd)) {
      return apiBadRequest("periodStart는 periodEnd보다 이전이어야 합니다")
    }

    const startMs = Date.now()
    const { reportData, summary } = await fetchWeeklyReport(periodStart, periodEnd)
    const durationMs = Date.now() - startMs

    const supabase = createServiceRoleClient()

    const { data: report, error: upsertError } = await supabase
      .from("weekly_analytics_reports")
      .upsert(
        {
          period_start: periodStart,
          period_end: periodEnd,
          report_data: reportData,
          summary,
          generated_by: "manual",
          generated_at: new Date().toISOString(),
          generation_duration_ms: durationMs,
        },
        { onConflict: "period_start,period_end" }
      )
      .select("id")
      .single()

    if (upsertError) {
      return apiError("리포트 저장 실패", 500, upsertError)
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      periodStart,
      periodEnd,
      durationMs,
    })
  } catch (error) {
    return apiError("리포트 생성 실패", 500, error)
  }
}
