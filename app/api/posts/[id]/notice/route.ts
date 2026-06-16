import { NextRequest, NextResponse } from "next/server"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { canPostNotice } from "@/lib/board-moderator"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/posts/[id]/notice
 * 현재 유저가 이 글을 공지로 토글할 수 있는지 + 현재 공지 여부.
 * (수정 화면의 "공지로 추가" 버튼 노출 판단용)
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { userId } = await clerkAuth()
    const supabase = createServiceRoleClient()
    const { data: post } = await supabase
      .from("posts")
      .select("community_slug, is_notice")
      .eq("id", id)
      .single()
    if (!post) return NextResponse.json({ canPostNotice: false, isNotice: false })
    const can = userId ? await canPostNotice(supabase, userId, post.community_slug) : false
    return NextResponse.json({ canPostNotice: can, isNotice: !!post.is_notice })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

const PatchSchema = z.object({ is_notice: z.boolean() })

/**
 * PATCH /api/posts/[id]/notice
 * 기존 글을 그 게시판의 공지로 설정/해제. admin / 글로벌 moderator / 해당 게시판 board MOD 만.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { userId } = await clerkAuth()
    if (!userId) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    const { data: post } = await supabase
      .from("posts")
      .select("community_slug, is_notice")
      .eq("id", id)
      .single()
    if (!post) return apiBadRequest("글을 찾을 수 없습니다.")

    if (!(await canPostNotice(supabase, userId, post.community_slug))) {
      return NextResponse.json({ error: "공지로 등록할 권한이 없습니다." }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("is_notice(boolean)가 필요합니다.")
    const isNotice = parsed.data.is_notice

    const { error } = await supabase.from("posts").update({ is_notice: isNotice }).eq("id", id)
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: isNotice ? "pin_post" : "unpin_post",
      targetType: "post",
      targetId: id,
      details: { community_slug: post.community_slug, source: "edit" },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true, isNotice })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}
