import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

const reportPatchSchema = z.object({
  reportId: z.string().min(1, "reportId가 필요합니다."),
  action: z.enum(["resolve", "dismiss", "reviewing"], { message: "잘못된 action입니다." }),
  resolution: z.string().optional(),
})

const RED_REASONS = ["discrimination", "advertising"] as const
const YELLOW_REASONS = ["profanity", "abuse", "political"] as const

function getCardType(reason: string): "red" | "yellow" {
  if ((RED_REASONS as readonly string[]).includes(reason)) return "red"
  return "yellow"
}

/**
 * 신고 처리 시 카드 발급 + 옐로 2장 누적 시 자동 정지
 * 1. 신고 대상 콘텐츠의 작성자를 조회
 * 2. 카드 발급 (옐로카드는 1년 후 만료)
 * 3. 유효한 옐로카드 2장 이상 → 자동 정지
 */
async function issueCardAndCheckSuspension(
  supabase: SupabaseClient,
  reportId: string
): Promise<{ cardIssued: boolean; suspended: boolean }> {
  // 1. 신고 정보 조회
  const { data: report } = await supabase
    .from("content_reports")
    .select("target_type, target_id, reason")
    .eq("id", reportId)
    .single()

  if (!report) return { cardIssued: false, suspended: false }

  // 2. 콘텐츠 작성자 조회
  const table = report.target_type === "post" ? "posts" : "comments"
  const { data: content } = await supabase
    .from(table)
    .select("user_id")
    .eq("id", report.target_id)
    .single()

  if (!content?.user_id) return { cardIssued: false, suspended: false }

  const targetUserId = content.user_id
  const cardType = getCardType(report.reason)
  const now = new Date()
  const expiresAt =
    cardType === "yellow"
      ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString()
      : null // 레드카드는 만료 없음

  // 3. 카드 발급
  const { error: cardError } = await supabase.from("user_cards").insert({
    user_id: targetUserId,
    card_type: cardType,
    reason: report.reason,
    report_id: reportId,
    issued_at: now.toISOString(),
    expires_at: expiresAt,
  })

  if (cardError) {
    console.error("Card issue error:", cardError)
    return { cardIssued: false, suspended: false }
  }

  // 4. 유효한 옐로카드 수 체크 (만료되지 않은 것만)
  const { count } = await supabase
    .from("user_cards")
    .select("*", { count: "exact", head: true })
    .eq("user_id", targetUserId)
    .eq("card_type", "yellow")
    .gt("expires_at", now.toISOString())

  const activeYellowCount = count ?? 0

  // 5. 옐로카드 2장 이상이면 자동 정지
  if (activeYellowCount >= 2) {
    // 이미 활성 정지가 있는지 체크
    const { data: existingSuspension } = await supabase
      .from("user_suspensions")
      .select("id")
      .eq("user_id", targetUserId)
      .or("suspended_until.is.null,suspended_until.gt." + now.toISOString())
      .maybeSingle()

    if (!existingSuspension) {
      await supabase.from("user_suspensions").insert({
        user_id: targetUserId,
        reason: `옐로카드 ${activeYellowCount}장 누적 (자동 정지)`,
      })
      return { cardIssued: true, suspended: true }
    }
  }

  return { cardIssued: true, suspended: false }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "pending"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "30")
    const offset = (page - 1) * limit

    let query = supabase.from("content_reports").select("*", { count: "exact" })

    if (status !== "all") query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = reportPatchSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { reportId, action, resolution } = parsed.data

    let updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let auditAction = ""

    switch (action) {
      case "resolve":
        updateData.status = "resolved"
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = userId
        updateData.resolution = resolution || ""
        auditAction = "resolve_report"
        break
      case "dismiss":
        updateData.status = "dismissed"
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = userId
        updateData.resolution = resolution || "dismissed"
        auditAction = "dismiss_report"
        break
      case "reviewing":
        updateData.status = "reviewing"
        updateData.assigned_to = userId
        auditAction = "review_report"
        break
    }

    const { error } = await supabase.from("content_reports").update(updateData).eq("id", reportId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 신고 처리(resolve) 시 카드 발급 + 자동 정지 체크
    let cardIssued = false
    let userSuspended = false
    if (action === "resolve") {
      const result = await issueCardAndCheckSuspension(supabase, reportId)
      cardIssued = result.cardIssued
      userSuspended = result.suspended
    }

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: "report",
      targetId: reportId,
      details: { action, resolution, cardIssued, userSuspended },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true, cardIssued, userSuspended })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
