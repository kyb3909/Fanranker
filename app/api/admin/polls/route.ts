import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { requireAdmin } from "@/lib/supabase/admin"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const CreateSchema = z.object({
  question: z.string().trim().min(2).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
  allowReason: z.boolean().optional().default(true),
})

/**
 * POST /api/admin/polls
 * 관리자 폴 생성. 새 폴을 활성화하고 기존 활성 폴은 비활성화(한 번에 1개 노출).
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const user = await currentUser()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("질문과 선택지(2~6개)를 입력하세요.")
    const { question, options, allowReason } = parsed.data
    const optionsJson = options.map((label, i) => ({ key: `o${i + 1}`, label }))

    const supabase = createServiceRoleClient()
    // "한 번에 1개"는 사이드바 일반 폴끼리의 규칙 — VS 쟁점 폴(post_id)·MoTM 폴(kind)을
    // 같이 꺼버리면 안 된다 (2026-08-22 스코프 수정)
    await supabase
      .from("polls")
      .update({ is_active: false })
      .eq("is_active", true)
      .is("post_id", null)
      .eq("kind", "general")
    const { data: poll, error } = await supabase
      .from("polls")
      .insert({
        question,
        options: optionsJson,
        allow_reason: allowReason,
        created_by: user?.id ?? null,
        is_active: true,
      })
      .select("id")
      .single()
    if (error) return apiError("설문 생성 중 오류가 발생했습니다.", 500, error)

    return NextResponse.json({ success: true, id: poll.id })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
