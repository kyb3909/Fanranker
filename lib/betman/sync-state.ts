/**
 * betman_sync_state 테이블 업서트 유틸
 *
 * 가장 최근 레코드 1건을 찾아 update, 없으면 insert.
 */

import type { createServiceRoleClient } from "@/lib/supabase/server"

export async function updateSyncState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string | null,
  action: string,
  gamesCount: number,
  lastError: string | null,
  activeRounds?: string[]
) {
  try {
    const { data: existing } = await supabase
      .from("betman_sync_state")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const updateData: Record<string, unknown> = {
      last_checked_at: nowIso,
      updated_at: nowIso,
      last_sync_action: action,
      last_sync_games_count: gamesCount,
      last_error: lastError,
    }
    if (gmTs) updateData.latest_gm_ts = gmTs
    if (activeRounds) updateData.active_rounds = activeRounds

    if (existing) {
      await supabase.from("betman_sync_state").update(updateData).eq("id", existing.id)
    } else {
      await supabase.from("betman_sync_state").insert(updateData)
    }
  } catch (e) {
    console.error("[betman-sync-state] Failed to update sync state:", e)
  }
}
