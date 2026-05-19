import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const patchSchema = z.object({
  reportId: z.string().min(1, "reportId가 필요합니다."),
  action: z.enum(["reviewed", "dismissed", "actioned"], { message: "잘못된 action입니다." }),
})

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "open"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "30")
    const offset = (page - 1) * limit

    let query = supabase.from("metaverse_user_reports").select("*", { count: "exact" })
    if (status !== "all") query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const reports = data ?? []
    const userIds = Array.from(
      new Set(reports.flatMap((r) => [r.reporter_user_id, r.reported_user_id]).filter(Boolean))
    )

    const nicknameByUserId: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", userIds)
      for (const p of profiles ?? []) {
        if (p.nickname) nicknameByUserId[p.user_id] = p.nickname
      }
    }

    const enriched = reports.map((r) => ({
      ...r,
      reporter_nickname: nicknameByUserId[r.reporter_user_id] ?? null,
      reported_nickname: nicknameByUserId[r.reported_user_id] ?? null,
    }))

    return NextResponse.json({ reports: enriched, total: count ?? 0, page, limit })
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
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { reportId, action } = parsed.data

    const { error } = await supabase
      .from("metaverse_user_reports")
      .update({
        status: action,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq("id", reportId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: `metaverse_report_${action}`,
      targetType: "metaverse_report",
      targetId: reportId,
      details: { action },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
