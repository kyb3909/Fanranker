import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { fetchWeeklyReport } from "@/lib/ga4/fetch-weekly-report"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    // 지난주 월~일 계산
    const now = new Date()
    const lastMonday = new Date(now)
    lastMonday.setDate(lastMonday.getDate() - ((lastMonday.getDay() + 6) % 7) - 7)
    lastMonday.setHours(0, 0, 0, 0)
    const lastSunday = new Date(lastMonday)
    lastSunday.setDate(lastSunday.getDate() + 6)

    const periodStart = lastMonday.toISOString().split("T")[0]
    const periodEnd = lastSunday.toISOString().split("T")[0]

    const supabase = createServiceRoleClient()

    // 중복 체크
    const { data: existing } = await supabase
      .from("weekly_analytics_reports")
      .select("id")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Report already exists for this period",
        reportId: existing.id,
        skipped: true,
      })
    }

    const startMs = Date.now()
    const { reportData, summary } = await fetchWeeklyReport(periodStart, periodEnd)
    const durationMs = Date.now() - startMs

    const { data: report, error: insertError } = await supabase
      .from("weekly_analytics_reports")
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        report_data: reportData,
        summary,
        generated_by: "cron",
        generation_duration_ms: durationMs,
      })
      .select("id")
      .single()

    if (insertError) {
      return apiError("리포트 저장에 실패했습니다.", 500, insertError)
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      periodStart,
      periodEnd,
      durationMs,
    })
  } catch (error) {
    return apiError("Weekly analytics cron failed", 500, error)
  }
}

/**
 * Vercel Cron 은 GET 으로 호출한다 (메서드 지정 불가). 실제 로직은 POST 에 있으므로
 * GET 을 POST 로 위임. POST 내부의 verifyCronSecret 이 무단 호출을 차단한다.
 */
export const GET = withCronLog("weekly-analytics", (request: NextRequest) => POST(request))
