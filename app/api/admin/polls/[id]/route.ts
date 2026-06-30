import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/supabase/admin"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const PatchSchema = z.object({ is_active: z.boolean() })

/**
 * PATCH /api/admin/polls/[id] — 활성/비활성 토글.
 * 활성화 시 기존 활성 폴은 자동 비활성(한 번에 1개 노출).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }
    const { id } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("is_active(boolean)이 필요합니다.")
    const { is_active } = parsed.data

    const supabase = createServiceRoleClient()
    if (is_active) {
      await supabase.from("polls").update({ is_active: false }).eq("is_active", true)
    }
    const { error } = await supabase.from("polls").update({ is_active }).eq("id", id)
    if (error) return apiError("상태 변경 중 오류가 발생했습니다.", 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * DELETE /api/admin/polls/[id] — 설문 삭제(투표 기록 cascade).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }
    const { id } = await params
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from("polls").delete().eq("id", id)
    if (error) return apiError("삭제 중 오류가 발생했습니다.", 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
