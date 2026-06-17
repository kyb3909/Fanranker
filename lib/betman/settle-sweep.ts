import { SupabaseClient } from "@supabase/supabase-js"
import { settlePredictions } from "./settle"

const GAME_SELECT =
  "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"

interface PendingPrediction {
  id: string
  user_id: string
  game_id: string
  prediction: string
  status: string
  stake: number | null
  slip_id: string | null
  locked_odds: number | null
}

export interface SettleSweepResult {
  pendingPredictions: number
  settleableGames: number
  settled: number
  correct: number
  wrong: number
  cancelled: number
  slipsWon: number
  slipsLost: number
  errors: string[]
}

const EMPTY = (pendingPredictions = 0, settleableGames = 0): SettleSweepResult => ({
  pendingPredictions,
  settleableGames,
  settled: 0,
  correct: 0,
  wrong: 0,
  cancelled: 0,
  slipsWon: 0,
  slipsLost: 0,
  errors: [],
})

/**
 * 안전망 스윕: 완료/취소된 게임의 미정산(pending) 픽을 전부 정산한다.
 *
 * 왜 필요한가 — 자동 정산은 POST /api/betman/results 안에서 "그 POST 가 처리하는
 * 라운드의 게임" 에 대해서만 픽을 정산한다. 게임 결과가 그 흐름 밖에서 확정되면
 * (점수→결과 유추 백필, 늦은/별도 업데이트, 재싱크 등) 게임은 갱신되지만 픽은
 * pending 으로 남는다. 슬립은 모든 픽이 정산돼야 정산되므로(settle.ts) 고아 픽
 * 하나가 슬립 전체를 멈춘다. 이 스윕이 결과 경로와 무관하게 주기적으로 정리한다.
 *
 * DB 만 사용 (betman.co.kr 접근 없음) → Vercel cron 에서 안전하게 실행 가능.
 */
export async function settleAllPendingCompleted(
  supabase: SupabaseClient
): Promise<SettleSweepResult> {
  // 1) 전체 pending 픽 (페이지네이션)
  const pending: PendingPrediction[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id, locked_odds")
      .eq("status", "pending")
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data || []) as PendingPrediction[]
    pending.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  if (pending.length === 0) return EMPTY()

  // 2) 그 게임 중 완료/취소 + 결과 확정된 것만
  const gameIds = [...new Set(pending.map((p) => p.game_id).filter(Boolean))]
  const games: Array<Record<string, unknown>> = []
  for (let i = 0; i < gameIds.length; i += 200) {
    const { data, error } = await supabase
      .from("betman_games")
      .select(GAME_SELECT)
      .in("id", gameIds.slice(i, i + 200))
      .in("status", ["completed", "cancelled"])
    if (error) throw error
    games.push(...(data || []))
  }
  const settleable = games.filter(
    (g) => g.status === "cancelled" || (!!g.result && g.result !== "")
  )
  if (settleable.length === 0) return EMPTY(pending.length, 0)

  const settleableIds = new Set(settleable.map((g) => String(g.id)))
  const targets = pending.filter((p) => settleableIds.has(p.game_id))
  if (targets.length === 0) return EMPTY(pending.length, settleable.length)

  const res = await settlePredictions(supabase, settleable as never, targets as never, {
    actor: "cron:settle-sweep",
  })

  return {
    pendingPredictions: pending.length,
    settleableGames: settleable.length,
    settled: res.settled,
    correct: res.correct,
    wrong: res.wrong,
    cancelled: res.cancelled,
    slipsWon: res.slipsWon,
    slipsLost: res.slipsLost,
    errors: res.errors,
  }
}
