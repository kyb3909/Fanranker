import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchTransferFeed } from "@/lib/transfer/feed"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/transfer/feed — 이적시장 상황판 피드 (비로그인 공개).
 * 클라이언트 SWR 주기 갱신용. 티커 크롤이 10분 주기라 60s 캐시로 충분.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()
    const items = await fetchTransferFeed(supabase)
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    )
  } catch (error) {
    apiError("Transfer feed error", 500, error)
    return NextResponse.json({ items: [] })
  }
}
