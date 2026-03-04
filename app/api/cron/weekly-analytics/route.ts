import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
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
      return apiError("Failed to save report", 500, insertError)
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

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  return POST(request)
}
