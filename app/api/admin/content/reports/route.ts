import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { enrichReports } from "@/lib/admin/enrich-reports"
import { apiError, apiBadRequest } from "@/lib/api-error"
import {
  authorTableFor,
  cardTypeFor,
  summarizeResolveOutcome,
  YELLOW_SUSPENSION_THRESHOLD,
  type ResolveOutcome,
} from "@/lib/admin/report-actions"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

const reportPatchSchema = z.object({
  reportId: z.string().min(1, "reportId가 필요합니다."),
  action: z.enum(["resolve", "dismiss", "reviewing"], { message: "잘못된 action입니다." }),
  resolution: z.string().optional(),
})

/** 이 상태에서만 다음 상태로 갈 수 있다 — 이미 끝난 신고를 다시 처리하지 않기 위한 대조 */
const ALLOWED_FROM: Record<"resolve" | "dismiss" | "reviewing", string[]> = {
  resolve: ["pending", "reviewing"],
  dismiss: ["pending", "reviewing"],
  reviewing: ["pending"],
}

/**
 * 신고 인정 시 카드 발급 + 옐로 누적 정지.
 *
 * ⚠️ 정책은 그대로다(옐로 1년 만료, 레드 만료 없음, 유효 옐로 2장이면 종료일 없는 정지).
 * 바뀐 것은 **실패를 감추지 않는다**는 점이다. 종전에는 카드 insert 실패가 조용한 false 였고,
 * 정지 insert 오류는 확인조차 하지 않은 채 `suspended: true` 를 반환했다.
 */
async function issueCardAndCheckSuspension(
  supabase: SupabaseClient,
  reportId: string
): Promise<ResolveOutcome> {
  const base: ResolveOutcome = {
    statusChanged: true,
    cardIssued: false,
    cardError: false,
    suspended: false,
    suspensionError: false,
    targetMissing: false,
  }

  const { data: report } = await supabase
    .from("content_reports")
    .select("target_type, target_id, reason")
    .eq("id", reportId)
    .single()
  if (!report) return { ...base, targetMissing: true }

  // ⚠️ target_type 은 post·comment 외에 ticker 도 허용된다. 종전 코드는 post 가 아니면
  //    무조건 comments 를 뒤져 티커 신고가 엉뚱한 표를 조회했다 — 작성자 없는 대상은 건너뛴다.
  const table = authorTableFor(report.target_type)
  if (!table) return { ...base, targetMissing: true }

  const { data: content } = await supabase
    .from(table)
    .select("user_id")
    .eq("id", report.target_id)
    .single()
  if (!content?.user_id) return { ...base, targetMissing: true }

  const targetUserId = content.user_id as string
  const cardType = cardTypeFor(report.reason)
  const now = new Date()
  const expiresAt =
    cardType === "yellow"
      ? // 1년 뒤 같은 날. UTC 기준으로 계산한다 — 로컬 타임존으로 만들면 서버 지역에 따라
        // 만료일이 하루 어긋난다.
        new Date(
          Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())
        ).toISOString()
      : null

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
    return { ...base, cardError: true }
  }

  const { count } = await supabase
    .from("user_cards")
    .select("*", { count: "exact", head: true })
    .eq("user_id", targetUserId)
    .eq("card_type", "yellow")
    .gt("expires_at", now.toISOString())

  const activeYellowCount = count ?? 0
  if (activeYellowCount < YELLOW_SUSPENSION_THRESHOLD) {
    return { ...base, cardIssued: true }
  }

  const { data: existingSuspension } = await supabase
    .from("user_suspensions")
    .select("id")
    .eq("user_id", targetUserId)
    .or("suspended_until.is.null,suspended_until.gt." + now.toISOString())
    .maybeSingle()
  if (existingSuspension) return { ...base, cardIssued: true }

  const { error: suspendError } = await supabase.from("user_suspensions").insert({
    user_id: targetUserId,
    reason: `옐로카드 ${activeYellowCount}장 누적 (자동 정지)`,
  })
  if (suspendError) {
    console.error("Suspension insert error:", suspendError)
    return { ...base, cardIssued: true, suspensionError: true }
  }
  return { ...base, cardIssued: true, suspended: true }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "pending"
    // ⚠️ page 에 클램프가 없어 `?page=abc` 가 NaN 으로 range() 까지 흘러갔다
    const rawPage = Number.parseInt(searchParams.get("page") || "1", 10)
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
    const limit = parseLimit(searchParams, { def: 30, max: 100 })
    const offset = (page - 1) * limit
    // 오래된 순 — 최신 30건만 보이던 구조에서 가장 오래 방치된 신고에 도달하는 길
    const oldestFirst = searchParams.get("sort") === "oldest"

    let query = supabase.from("content_reports").select("*", { count: "exact" })
    if (status !== "all") query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: oldestFirst })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const enrichedReports = await enrichReports(supabase, data ?? [])
    return NextResponse.json({
      reports: enrichedReports,
      total: count ?? 0,
      page,
      limit,
      sort: oldestFirst ? "oldest" : "newest",
    })
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

    const nowIso = new Date().toISOString()
    const updateData: Record<string, unknown> = { updated_at: nowIso }
    let auditAction = ""

    switch (action) {
      case "resolve":
        updateData.status = "resolved"
        updateData.resolved_at = nowIso
        updateData.resolved_by = userId
        updateData.resolution = resolution || ""
        auditAction = "resolve_report"
        break
      case "dismiss":
        updateData.status = "dismissed"
        updateData.resolved_at = nowIso
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

    /**
     * ⚠️ **중복 실행 방지의 핵심.** 종전에는 id 조건만으로 update 해서, 이미 처리된 신고에
     * resolve 를 다시 보내면 카드가 한 장 더 발급됐다(응답이 유실돼 운영자가 다시 누르거나,
     * 두 사람이 동시에 누르는 경우). 현재 상태를 WHERE 에 넣어 **한 번만 전이**하게 한다 —
     * 갱신된 행이 0이면 이미 누군가 처리한 것이므로 제재를 실행하지 않는다.
     */
    const { data: updatedRows, error } = await supabase
      .from("content_reports")
      .update(updateData)
      .eq("id", reportId)
      .in("status", ALLOWED_FROM[action])
      .select("id, status")

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!updatedRows || updatedRows.length === 0) {
      const { data: current } = await supabase
        .from("content_reports")
        .select("status")
        .eq("id", reportId)
        .maybeSingle()
      if (!current) {
        return NextResponse.json({ error: "신고를 찾을 수 없습니다." }, { status: 404 })
      }
      return NextResponse.json(
        {
          error: "이미 처리된 신고입니다. 다시 실행하지 않았습니다.",
          alreadyHandled: true,
          currentStatus: current.status,
        },
        { status: 409 }
      )
    }

    let outcome: ResolveOutcome = {
      statusChanged: true,
      cardIssued: false,
      cardError: false,
      suspended: false,
      suspensionError: false,
      targetMissing: false,
    }
    if (action === "resolve") {
      outcome = await issueCardAndCheckSuspension(supabase, reportId)
    }
    const summary = summarizeResolveOutcome(outcome)

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: "report",
      targetId: reportId,
      details: {
        action,
        resolution,
        cardIssued: outcome.cardIssued,
        userSuspended: outcome.suspended,
        cardError: outcome.cardError,
        suspensionError: outcome.suspensionError,
        targetMissing: outcome.targetMissing,
      },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({
      success: true,
      cardIssued: outcome.cardIssued,
      userSuspended: outcome.suspended,
      // 부분 성공을 성공으로 표시하지 않기 위해 결과 판정을 그대로 내려보낸다
      verdict: summary.verdict,
      message: summary.message,
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
