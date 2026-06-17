import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { settleAllPendingCompleted } from "@/lib/betman/settle-sweep"

/**
 * GET /api/cron/settle-pending
 *
 * 미정산 픽 안전망 스윕 — 15분마다.
 *
 * 자동 정산(POST /api/betman/results)은 그 POST 가 처리하는 라운드 게임만 정산하므로,
 * 게임 결과가 그 흐름 밖에서 확정되면(점수 백필·늦은 업데이트 등) 픽이 pending 으로
 * 남고 슬립 전체가 멈춘다. 이 cron 이 결과 경로와 무관하게 완료된 게임의 pending 픽을
 * 주기적으로 정리한다. DB 만 사용 → Vercel(해외 IP) 에서 안전.
 */
async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const result = await settleAllPendingCompleted(supabase)

    return NextResponse.json({
      mode: "settle-sweep",
      ...result,
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("settle-pending", cronGet)

export async function POST(request: NextRequest) {
  return cronGet(request)
}
