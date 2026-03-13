import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/stickers/my
 * 내가 소유한 스티커 목록 (댓글 스티커 피커에서 사용)
 * ?q=검색어  (이름/태그 검색)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const q = request.nextUrl.searchParams.get("q")?.trim()

    const supabase = createServiceRoleClient()

    let query = supabase
      .from("user_stickers")
      .select("sticker_id, purchased_at, stickers(*)")
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })

    const { data, error } = await query

    if (error) return apiError("조회 실패", 500, error)

    let stickers = (data || []).map((row: Record<string, unknown>) => ({
      ...(row.stickers as Record<string, unknown>),
      purchased_at: row.purchased_at,
    }))

    // 클라이언트 사이드 필터 (join 테이블이라 Supabase에서 직접 ilike 불가)
    if (q) {
      const lower = q.toLowerCase()
      stickers = stickers.filter((s: Record<string, unknown>) => {
        const name = ((s.name as string) || "").toLowerCase()
        const tags = ((s.tags as string[]) || []).map((t) => t.toLowerCase())
        return name.includes(lower) || tags.some((t) => t.includes(lower))
      })
    }

    return NextResponse.json({ stickers })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
