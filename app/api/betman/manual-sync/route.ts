import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { updateSyncState } from "@/lib/betman/sync-state"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const manualSyncSchema = z.object({
  gmTs: z.union(
    [z.string().min(1), z.array(z.union([z.string(), z.number()])).min(1), z.number()],
    { message: 'gmTs가 필요합니다. 예: {"gmTs":"260021"} 또는 {"gmTs":["260021","260022"]}' }
  ),
})

/**
 * POST /api/betman/manual-sync
 *
 * 관리자가 특정 gmTs 의 재동기화를 요청하는 엔드포인트.
 *
 * betman.co.kr 은 한국 IP 에서만 접근 가능하므로 Vercel(해외 IP)에서 직접
 * 스크래핑하지 않는다. 대신 betman_sync_state 에 manual resync 플래그를
 * 세팅하고, Vultr 서울 VPS cron 이 이를 읽어 실제 동기화를 수행한다.
 *
 * NOTE: 과거 이 route 는 syncSingleGmTs 로 betman 을 직접 호출했으나,
 * Vercel 해외 IP 에서 100% 실패하므로 resync 신호 방식으로 전환됨
 * (betman-sync watchdog 의 VPS 신호 패턴과 동일).
 *
 * Body:
 *   { gmTs: "260021" }            - 단일 gmTs
 *   { gmTs: ["260021","260022"] } - 복수 gmTs
 * Auth: CRON_SECRET Bearer token
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const parsed = manualSyncSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(
        parsed.error.errors[0]?.message ||
          'gmTs가 필요합니다. 예: {"gmTs":"260021"} 또는 {"gmTs":["260021","260022"]}'
      )
    }

    // gmTs를 단일 또는 배열로 정규화
    let gmTsList: string[] = []
    const gmTsValue = parsed.data.gmTs
    if (Array.isArray(gmTsValue)) {
      gmTsList = gmTsValue.map((v) => String(v).trim()).filter(Boolean)
    } else {
      gmTsList = [String(gmTsValue).trim()]
    }

    for (const gmTs of gmTsList) {
      if (!/^\d+$/.test(gmTs)) {
        return apiBadRequest(`유효하지 않은 gmTs: "${gmTs}" (숫자만 가능)`)
      }
    }

    const supabase = createServiceRoleClient()

    // betman_sync_state 에 manual resync 플래그 세팅 → Vultr cron 이 처리
    const resyncFlag = {
      needs_resync: true,
      requested_at: new Date().toISOString(),
      reason: "manual",
      target_gm_ts: gmTsList,
    }
    await updateSyncState(supabase, null, "manual_resync_request", 0, JSON.stringify(resyncFlag))

    return NextResponse.json({
      ok: true,
      message: "Vultr 재동기화 요청이 등록되었습니다. 다음 VPS cron 주기에 처리됩니다.",
      target_gm_ts: gmTsList,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
