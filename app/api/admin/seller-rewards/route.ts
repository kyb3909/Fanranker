import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiBadRequest, apiError } from "@/lib/api-error"
import { z } from "zod"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
export async function GET() {
  const access = await requireAdminApi()
  if (isErrorResponse(access)) return access
  const { data, error } = await access.supabase
    .from("pending_seller_rewards")
    .select("id,seller_id,amount,description,attempts,last_error,created_at,status")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(50)
  if (error) return apiError("미지급 목록을 불러오지 못했습니다.", 500, error)
  return NextResponse.json({ rewards: data }, { headers: { "Cache-Control": "private, no-store" } })
}
export async function POST(request: NextRequest) {
  const access = await requireAdminApi()
  if (isErrorResponse(access)) return access
  const parsed = z
    .object({ id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiBadRequest("지급 항목을 확인해주세요.")
  const { data, error } = await access.supabase.rpc("retry_pending_seller_reward", {
    p_reward_id: parsed.data.id,
  })
  if (error) return apiError("지급 재시도에 실패했습니다.", 500, error)
  await writeAuditLog({
    adminUserId: access.userId,
    action: "seller_reward_retry",
    targetType: "pending_seller_rewards",
    targetId: parsed.data.id,
    details: { success: data?.success === true, duplicate: data?.duplicate === true },
    ipAddress: getIpFromRequest(request),
  }).catch((cause) => console.error("seller-reward-audit", cause))
  return NextResponse.json(data, {
    status: data?.success ? 200 : 409,
    headers: { "Cache-Control": "no-store" },
  })
}
