import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") || 8)))
    const now = Date.now()
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: items, error: itemsError },
      { count: newLastHour, error: hourError },
      { count: newLast24Hours, error: dayError },
    ] = await Promise.all([
      supabase
        .from("news_ticker_items")
        .select(
          "id, source_id, community_slug, headline_kr, original_title, importance, category, ticker_tag, posted_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("news_ticker_items")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneHourAgo),
      supabase
        .from("news_ticker_items")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
    ])

    if (itemsError) return apiError(itemsError.message, 500, itemsError)
    if (hourError) return apiError(hourError.message, 500, hourError)
    if (dayError) return apiError(dayError.message, 500, dayError)

    return NextResponse.json({
      items: items ?? [],
      counts: {
        newLastHour: newLastHour ?? 0,
        newLast24Hours: newLast24Hours ?? 0,
      },
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
