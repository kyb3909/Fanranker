import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"
import { z } from "zod"

const Body = z.object({
  title_id: z.string().uuid().nullable(),
})

/**
 * POST /api/profile/me/display-title
 * { title_id: uuid | null }  — null 이면 호칭 미표시
 *
 * 본인이 잠금 해제한 호칭 중 하나만 선택 가능. 검증:
 * - title_id 가 user_unlocked_titles 에 있는지 (본인 unlock 한 거)
 * - null 이면 그냥 표시 끔
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청입니다.")
    }
    const parsed = Body.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const supabase = createServiceRoleClient()
    const titleId = parsed.data.title_id

    if (titleId !== null) {
      const { data: ok } = await supabase
        .from("user_unlocked_titles")
        .select("title_id")
        .eq("user_id", user.id)
        .eq("title_id", titleId)
        .maybeSingle()
      if (!ok) {
        return apiBadRequest("잠금 해제하지 않은 호칭은 선택할 수 없습니다.")
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_title_id: titleId })
      .eq("user_id", user.id)

    if (error) {
      return apiError("호칭 저장 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({ success: true, display_title_id: titleId })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
