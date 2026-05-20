import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { updateSyncState } from "@/lib/betman/sync-state"

/**
 * GET /api/cron/betman-sync
 *
 * Betman 동기화 watchdog — 30분마다.
 *
 * betman.co.kr 은 한국 IP 에서만 접근 가능하므로 Vercel(해외 IP)에서 직접
 * 스크래핑하지 않는다. 게임 동기화·결과 수집·정산은 Vultr 서울 VPS cron
 * (sync.sh / fetch-results.sh) 이 전담한다.
 *
 * 이 route 는 DB 만 보고 다음을 수행:
 * 1. 동기화 staleness 감시
 * 2. 라운드 생명주기 관리 (과거 게임 정리, open 라운드 auto-close)
 * 3. staleness 감지 시 VPS 에 urgent resync 신호 (betman_sync_state 플래그)
 *
 * NOTE: 과거 이 route 는 Phase 3(fetchAllGmTs 직접 탐색)·3.5(fetchAndApplyResults
 * 결과 수집)에서 betman.co.kr 을 직접 호출했으나, Vercel 해외 IP 에서 100% 실패하며
 * 매 실행 5분 timeout 을 유발해 제거됨. betman 직접 접근은 Vultr 전담.
 */

const STALE_THRESHOLD_HOURS = 3
const URGENT_THRESHOLD_HOURS = 6
const PROBE_RANGE = 5

async function cronGet(request: NextRequest) {
  const start = Date.now()

  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const actions: string[] = []

    // ============================================
    // Phase 1: 동기화 상태 점검 (Staleness Check)
    // ============================================
    const { data: syncState } = await supabase
      .from("betman_sync_state")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date()
    let isStale = false
    let isUrgent = false
    let hoursSinceSync = 0

    if (syncState?.last_checked_at) {
      const lastCheck = new Date(syncState.last_checked_at)
      hoursSinceSync = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60)
      isStale = hoursSinceSync > STALE_THRESHOLD_HOURS
      isUrgent = hoursSinceSync > URGENT_THRESHOLD_HOURS

      if (isStale) {
        actions.push(`stale_detected: ${hoursSinceSync.toFixed(1)}h since last sync`)
      }
    } else {
      isUrgent = true
      actions.push("no_sync_state: first run or missing state")
    }

    // ============================================
    // Phase 2: 라운드 생명주기 관리
    // ============================================

    // 2-pre. 과거 scheduled 게임 자동 정리 → in_progress
    const { count: cleanedCount } = await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: now.toISOString() })
      .eq("status", "scheduled")
      .lt("match_time", now.toISOString())

    if (cleanedCount && cleanedCount > 0) {
      actions.push(`stale_games_cleaned: ${cleanedCount} past-due scheduled → in_progress`)
    }

    // 2a. 모든 게임이 completed인 open 라운드 → closed
    const { data: openRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts, round, status")
      .in("status", ["open"])

    if (openRounds && openRounds.length > 0) {
      for (const round of openRounds) {
        const { data: scheduledGames } = await supabase
          .from("betman_games")
          .select("id")
          .eq("round_id", round.id)
          .eq("status", "scheduled")
          .limit(1)

        if (!scheduledGames || scheduledGames.length === 0) {
          await supabase
            .from("betman_rounds")
            .update({ status: "closed", updated_at: now.toISOString() })
            .eq("id", round.id)
          actions.push(`round_closed: ${round.gm_ts} (no scheduled games left)`)
        }
      }
    }

    // 2b. 마감 기한 지난 open 라운드 → closed
    const { data: expiredRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .eq("status", "open")
      .lt("deadline", now.toISOString())

    if (expiredRounds && expiredRounds.length > 0) {
      for (const round of expiredRounds) {
        await supabase
          .from("betman_rounds")
          .update({ status: "closed", updated_at: now.toISOString() })
          .eq("id", round.id)
        actions.push(`round_expired: ${round.gm_ts}`)
      }
    }

    // ============================================
    // Phase 3: 동기화 상태 갱신 / VPS resync 신호
    // ============================================
    if (isStale) {
      const resyncFlag = {
        needs_resync: true,
        requested_at: now.toISOString(),
        reason: isUrgent ? "urgent" : "stale",
        hours_since_sync: hoursSinceSync,
        probe_range_start: syncState?.latest_gm_ts
          ? String(parseInt(syncState.latest_gm_ts, 10) + 1)
          : null,
        probe_range_end: syncState?.latest_gm_ts
          ? String(parseInt(syncState.latest_gm_ts, 10) + PROBE_RANGE)
          : null,
      }

      await updateSyncState(supabase, null, "watchdog_alert", 0, JSON.stringify(resyncFlag))
      actions.push(
        `resync_flagged: ${isUrgent ? "URGENT" : "stale"} (${hoursSinceSync.toFixed(1)}h)`
      )
    } else {
      await updateSyncState(supabase, null, "watchdog_ok", 0, null)
    }

    return NextResponse.json({
      mode: "watchdog",
      isStale,
      isUrgent,
      hoursSinceSync: hoursSinceSync.toFixed(1),
      actions,
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("betman-sync", cronGet)

export async function POST(request: NextRequest) {
  return cronGet(request)
}
