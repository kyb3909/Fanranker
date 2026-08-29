import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { settleAllPendingCompleted } from "@/lib/betman/settle-sweep"
import { crosscheckFootballResults } from "@/lib/betman/result-crosscheck"

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

    // ① 결과 교차검증 (2026-08-30 운영자 확정: 검증 완료 + 오류 없음 → 그 다음 정산).
    //    축구 완료 경기를 LFA×와이즈토토 대조 → verdict 기록, 불일치는 디스코드 알림.
    //    실패해도 스윕은 계속 간다 — 게이트가 fail-closed 라 미검증 축구는 어차피 보류된다.
    const crosscheck = await crosscheckFootballResults(supabase).catch((e) => {
      console.warn("[settle-pending] 교차검증 실패 — 스윕은 계속:", e)
      return null
    })

    // ② 안전망 스윕 — settlePredictions 안의 게이트가 verdict 를 읽는다
    const result = await settleAllPendingCompleted(supabase)

    return NextResponse.json({
      mode: "settle-sweep",
      crosscheck,
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
