import { NextRequest, NextResponse } from "next/server"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { canPostNotice } from "@/lib/board-moderator"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/community/[slug]/notice
 * 현재 유저가 이 게시판에 공지를 쓸 수 있는지 (admin / 글로벌 moderator / board MOD).
 * 게시판의 "공지 작성" 버튼 노출 판단용. 실제 공지 작성은 /write?community=<slug>&notice=1 로.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const { userId } = await clerkAuth()
    if (!userId) return NextResponse.json({ canPostNotice: false })
    const supabase = createServiceRoleClient()
    return NextResponse.json({ canPostNotice: await canPostNotice(supabase, userId, slug) })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}
