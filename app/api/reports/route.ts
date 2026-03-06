import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const VALID_REASONS = ["discrimination", "advertising", "profanity", "abuse", "political"] as const

const ReportCreateSchema = z.object({
  targetType: z.enum(["post", "comment"], { message: "잘못된 targetType입니다." }),
  targetId: z.string().min(1, "대상 ID가 필요합니다."),
  reason: z.enum(VALID_REASONS, { message: "잘못된 신고 사유입니다." }),
  description: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const result = ReportCreateSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { targetType, targetId, reason, description } = result.data

    const supabase = createServiceRoleClient()

    // 중복 신고 방지: 같은 reporter + target 조합 체크
    const { data: existing } = await supabase
      .from("content_reports")
      .select("id")
      .eq("reporter_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: "이미 신고한 콘텐츠입니다." }, { status: 409 })
    }

    // 신고 INSERT
    const { error } = await supabase.from("content_reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      description: description || null,
      status: "pending",
    })

    if (error) {
      return apiError("신고 접수에 실패했습니다.", 500, error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
