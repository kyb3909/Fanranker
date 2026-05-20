import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { updateSyncState } from "@/lib/betman/sync-state"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/betman/resync
 *
 * 어드민이 betman 긴급 재동기화를 요청한다. betman.co.kr 은 한국 IP 에서만
 * 접근 가능하므로 Vercel 에서 직접 동기화하지 않고, betman_sync_state 에
 * resync 플래그를 세팅한다. Vultr 서울 VPS cron 이 이를 읽어 실제 동기화를
 * 수행한다.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const resyncFlag = {
      needs_resync: true,
      requested_at: new Date().toISOString(),
      reason: "admin_manual",
      requested_by: userId,
    }
    await updateSyncState(supabase, null, "admin_resync_request", 0, JSON.stringify(resyncFlag))

    await writeAuditLog({
      adminUserId: userId,
      action: "betman_resync_request",
      targetType: "betman_sync_state",
      targetId: "betman_sync_state",
      details: resyncFlag,
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({
      ok: true,
      message: "Vultr 재동기화 요청이 등록되었습니다. 다음 VPS cron 주기에 처리됩니다.",
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
