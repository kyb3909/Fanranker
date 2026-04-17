import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

const RoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth
    const { userId } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = RoleSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("유효한 role이 필요합니다: user, moderator, admin")
    const { role } = parsed.data

    // Self-demote 방지: admin이 자기 자신을 admin 외로 강등하면 어드민 패널 접근권 상실 →
    // UI에서 잘못 누른 footgun 방지. admin 권한 이양은 다른 admin이 수행하도록 강제.
    if (adminId === userId && role !== "admin") {
      return apiBadRequest(
        "자기 자신의 admin 권한을 강등할 수 없습니다. 다른 관리자에게 요청하세요."
      )
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", userId)

    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: adminId,
      action: "change_role",
      targetType: "user",
      targetId: userId,
      details: { role },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
