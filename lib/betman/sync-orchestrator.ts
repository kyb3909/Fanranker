/**
 * betman 단일 gmTs(회차) 동기화 오케스트레이터
 *
 * fetchGameData → betman_rounds 생성/업데이트 → parseGames → betman_games upsert.
 * Vercel cron(watchdog) + manual-sync 라우트가 공유.
 */

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchGameData, parseGames } from "./game-fetcher"

const UPSERT_BATCH_SIZE = 100
const ROUND_DEADLINE_DAYS = 7

export type SyncResult =
  | { action: "checked" | "created" | "updated"; roundId: string; games: number; errors: number }
  | { error: string }

export async function syncSingleGmTs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string
): Promise<SyncResult> {
  const raw = await fetchGameData(gmTs)
  if (!raw || raw.datas.length === 0) {
    return { action: "checked", roundId: "", games: 0, errors: 0 }
  }

  const year = new Date().getFullYear()
  const roundNum = parseInt(gmTs, 10) || 0

  const { data: existingRound } = await supabase
    .from("betman_rounds")
    .select("id")
    .eq("gm_ts", gmTs)
    .maybeSingle()

  let roundId: string
  let isNew = false

  if (existingRound) {
    roundId = existingRound.id
    // 다시 활성화 (closed → open). games 동기화 중 closed라면 재개.
    await supabase
      .from("betman_rounds")
      .update({ status: "open" })
      .eq("id", roundId)
      .eq("status", "closed")
  } else {
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + ROUND_DEADLINE_DAYS)
    deadline.setHours(23, 59, 59, 999)

    const { data: newRound, error: insertError } = await supabase
      .from("betman_rounds")
      .insert({
        gm_ts: gmTs,
        year,
        round: roundNum,
        status: "open",
        deadline: deadline.toISOString(),
      })
      .select("id")
      .single()

    if (insertError || !newRound) {
      return { error: `라운드 생성 실패 (${gmTs}): ${insertError?.message}` }
    }
    roundId = newRound.id
    isNew = true
  }

  const games = parseGames(raw, roundId)

  // 이미 종료된 game_no는 건드리지 않음
  const { data: finishedGames } = await supabase
    .from("betman_games")
    .select("game_no")
    .eq("round_id", roundId)
    .in("status", ["completed", "cancelled"])

  const finishedGameNos = new Set((finishedGames || []).map((g: { game_no: number }) => g.game_no))
  const newOrScheduledGames = games.filter((g) => !finishedGameNos.has(g.game_no))

  let upsertedCount = 0
  let errorCount = 0

  for (let i = 0; i < newOrScheduledGames.length; i += UPSERT_BATCH_SIZE) {
    const batch = newOrScheduledGames.slice(i, i + UPSERT_BATCH_SIZE)
    const { error } = await supabase
      .from("betman_games")
      .upsert(batch, { onConflict: "round_id,game_no", ignoreDuplicates: false })

    if (error) {
      console.error(`[betman-sync] Batch upsert error (gmTs=${gmTs}):`, error)
      errorCount++
    } else {
      upsertedCount += batch.length
    }
  }

  return {
    action: isNew ? "created" : "updated",
    roundId,
    games: upsertedCount,
    errors: errorCount,
  }
}
