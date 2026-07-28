import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

/**
 * GET /api/admin/content/stickers
 * 관리자용 스티커 목록 (pending 우선)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = request.nextUrl
    const status = searchParams.get("status") || "pending"
    const limit = parseLimit(searchParams, { def: 50, max: 100 })
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("stickers")
      .select(
        "id, name, image_url, media_type, status, price, vote_count, vote_threshold, purchase_count, use_count, board_slug, tags, created_at, approved_at, rejected_at, creator_id",
        { count: "exact" }
      )

    if (status !== "all") {
      query = query.eq("status", status)
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query
    if (error) return apiError(error.message, 500, error)

    // creator 닉네임 조회
    const creatorIds = [...new Set((data ?? []).map((s) => s.creator_id).filter(Boolean))]
    let creatorMap: Record<string, string> = {}
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", creatorIds)
      if (profiles) {
        creatorMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.nickname]))
      }
    }

    const stickers = (data ?? []).map((s) => ({
      ...s,
      creator_nickname: creatorMap[s.creator_id] || "알 수 없음",
    }))

    return NextResponse.json({ stickers, total: count ?? 0 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

/**
 * PATCH /api/admin/content/stickers
 * 스티커 승인/거절
 * Body: { sticker_id, action: 'approve' | 'reject' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const { sticker_id, action } = body as { sticker_id?: string; action?: string }
    if (!sticker_id || !action || !["approve", "reject"].includes(action)) {
      return apiBadRequest("sticker_id와 action(approve/reject)이 필요합니다.")
    }

    const now = new Date().toISOString()
    const updateData =
      action === "approve"
        ? { status: "approved", approved_at: now }
        : { status: "rejected", rejected_at: now }

    const { error } = await supabase.from("stickers").update(updateData).eq("id", sticker_id)

    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: adminId,
      action: action === "approve" ? "approve_sticker" : "reject_sticker",
      targetType: "sticker",
      targetId: sticker_id,
      details: { action },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
