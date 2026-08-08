import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { settlePredictions } from "@/lib/betman/settle"

/**
 * POST /api/betman/expire-pending
 *
 * 48시간 이상 경과했는데 결과가 영영 안 온 경기의 pending 예측을 취소 처리.
 * Vultr cron에서 주기적으로 호출.
 *
 * 2026-08-08 감사 P1-1: 기존에는 SQL 함수 `expire_stale_pending_predictions`가
 * 슬립 won/lost/cancelled 판정을 **독립 재구현**하고 있었다 — 부분취소 total_odds
 * 재계산·settlement_audit_log·정산 알림·유저 통계·환불 실패 시 pending_refunds
 * 큐잉이 전부 빠진 두 번째 상태머신. 여기서 취소만 수행하고 슬립 정산은
 * settlePredictions 에 넘겨 정산 로직을 한 곳으로 통일한다 (games 를 빈 배열로
 * 주면 개별 예측 정산은 건너뛰고 슬립 정산·audit·알림·통계만 수행하는 성질 이용).
 *
 * 결과가 이미 있는 경기는 여기서 건드리지 않는다 — settle-pending 15분 스윕의 몫
 * (구 SQL 은 결과 유무와 무관하게 전부 취소해 정상 정산 대상까지 삼킬 수 있었다).
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

    const { data: stale, error: staleError } = await supabase
      .from("betman_predictions")
      .select(
        "id, user_id, game_id, prediction, status, stake, slip_id, locked_odds, betman_games!inner(match_time, result)"
      )
      .eq("status", "pending")
      .lt("betman_games.match_time", cutoff)
      .is("betman_games.result", null)
      .limit(500)
    if (staleError) {
      return NextResponse.json({ error: staleError.message }, { status: 500 })
    }

    const staleRows = (stale ?? []).map((row) => ({
      id: row.id as string,
      user_id: row.user_id as string,
      game_id: row.game_id as string,
      prediction: row.prediction as string,
      status: row.status as string,
      stake: row.stake as number | null,
      slip_id: row.slip_id as string | null,
      locked_odds: row.locked_odds as number | null,
    }))
    if (staleRows.length === 0) {
      return NextResponse.json({ success: true, result: { expired_count: 0 } })
    }

    // 예측 취소 — 조건부 갱신(CAS)이라 동시 정산과 겹쳐도 한쪽만 성공
    const { data: expired, error: expireError } = await supabase
      .from("betman_predictions")
      .update({
        status: "cancelled",
        is_correct: null,
        points_earned: 0,
        settled_at: new Date().toISOString(),
      })
      .in(
        "id",
        staleRows.map((r) => r.id)
      )
      .eq("status", "pending")
      .select("id")
    if (expireError) {
      return NextResponse.json({ error: expireError.message }, { status: 500 })
    }

    // 슬립 정산은 정본 한 곳으로 — 재계산·환불(+실패 큐잉)·audit·알림·통계 포함
    const settleResult = await settlePredictions(supabase, [], staleRows, {
      actor: "cron:expire-stale",
    })

    return NextResponse.json({
      success: true,
      result: {
        expired_count: expired?.length ?? 0,
        slips_won: settleResult.slipsWon,
        slips_lost: settleResult.slipsLost,
        errors: settleResult.errors,
      },
      message: "만료 처리 완료",
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
