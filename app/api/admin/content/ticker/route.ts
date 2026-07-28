import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const tickerPatchSchema = z.object({
  itemId: z.union([z.string(), z.number()]).transform(String),
  importance: z.union([z.string(), z.number()]).transform(Number),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseLimit(searchParams, { def: 30, max: 100 })
    const community = searchParams.get("community") || ""
    const offset = (page - 1) * limit

    let query = supabase
      .from("news_ticker_items")
      .select(
        "id, source_id, community_slug, headline_kr, original_title, importance, category, ticker_tag, posted_at, created_at",
        { count: "exact" }
      )

    if (community) query = query.eq("community_slug", community)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, limit })
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
    const parsed = tickerPatchSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "itemId와 importance가 필요합니다.")
    }
    const { itemId, importance } = parsed.data

    const { error } = await supabase
      .from("news_ticker_items")
      .update({ importance })
      .eq("id", itemId)

    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: "update_ticker_importance",
      targetType: "ticker",
      targetId: String(itemId),
      details: { importance },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get("id")

    if (!itemId) {
      return apiBadRequest("id가 필요합니다.")
    }

    const { error } = await supabase.from("news_ticker_items").delete().eq("id", itemId)
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: "delete_ticker_item",
      targetType: "ticker",
      targetId: itemId,
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
