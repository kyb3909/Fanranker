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

    const body = await request.json()
    const parsed = RoleSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("유효한 role이 필요합니다: user, moderator, admin")
    const { role } = parsed.data

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
