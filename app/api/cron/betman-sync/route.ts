import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { fetchAllGmTs } from "@/lib/betman/game-fetcher"
import { syncSingleGmTs } from "@/lib/betman/sync-orchestrator"
import { fetchAndApplyResults } from "@/lib/betman/result-fetcher"
import { updateSyncState } from "@/lib/betman/sync-state"

/**
 * GET /api/cron/betman-sync
 *
 * Vercel Cron Watchdog + Round Maintenance
 *
 * betman.co.kr은 한국 IP에서만 접근 가능하므로 Vercel에서 직접 스크래핑하지 않음.
 * 대신 아래 역할을 수행:
 *
 * 1. 동기화 staleness 감시 → VPS에 urgent resync 신호
 * 2. 라운드 생명주기 관리 (auto-close, status 정리)
 * 3. 새 회차 감지를 위한 DB 기반 프로빙 요청 플래그
 * 4. 동기화 상태 헬스체크 및 로깅
 *
 * 도메인 로직은 lib/betman/에 분리:
 * - game-fetcher / result-fetcher: betman HTTP 조회
 * - sync-orchestrator: 단일 gmTs 업서트
 * - sync-state: betman_sync_state 갱신
 */

const STALE_THRESHOLD_HOURS = 3
const URGENT_THRESHOLD_HOURS = 6
const PROBE_RANGE = 5

export async function GET(request: NextRequest) {
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
    // Phase 3: 새 회차 직접 탐색 시도 (Vercel → betman)
    // ============================================
    // Vercel이 해외 IP라 실패할 수 있지만, 일부 CDN 엣지에서는 성공할 수도 있음
    const directSyncResults: Array<{
      gmTs: string
      action: string
      roundId: string
      games: number
      errors: number
    }> = []

    // 3a. betman API에서 구매 가능 gmTs 직접 시도
    const gmTsList = await fetchAllGmTs()

    if (gmTsList.length > 0) {
      actions.push(`direct_api_success: found gmTs ${gmTsList.join(", ")}`)

      for (const gmTs of gmTsList) {
        const result = await syncSingleGmTs(supabase, gmTs)
        if (!("error" in result)) {
          directSyncResults.push({ gmTs, ...result })
          if (result.action === "created") {
            actions.push(`new_round_synced: ${gmTs} (${result.games} games)`)
          }
        }
      }
    } else {
      actions.push("direct_api_failed: betman unreachable from Vercel (expected)")

      // 3b. Fallback: DB 기반 프로빙 (+1 ~ +PROBE_RANGE)
      const latestGmTs = syncState?.latest_gm_ts
      if (latestGmTs) {
        const current = parseInt(latestGmTs, 10)
        if (!isNaN(current)) {
          actions.push(`probing: trying gmTs ${current + 1} to ${current + PROBE_RANGE}`)

          for (let i = 1; i <= PROBE_RANGE; i++) {
            const candidate = String(current + i)
            const result = await syncSingleGmTs(supabase, candidate)
            if (!("error" in result) && result.games > 0) {
              directSyncResults.push({ gmTs: candidate, ...result })
              actions.push(`probe_success: gmTs ${candidate} (${result.games} games)`)
            }
          }
        }
      }
    }

    // ============================================
    // Phase 3.5: 경기 결과 수집 + 자동 정산
    // ============================================
    let resultsFetched = 0
    let resultsCancelled = 0
    const resultErrors: string[] = []

    const { data: roundsNeedingResults } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .in("status", ["open", "closed"])
      .order("gm_ts", { ascending: false })
      .limit(5)

    if (roundsNeedingResults && roundsNeedingResults.length > 0) {
      for (const round of roundsNeedingResults) {
        const { count: pendingCount } = await supabase
          .from("betman_games")
          .select("*", { count: "exact", head: true })
          .eq("round_id", round.id)
          .in("status", ["scheduled", "in_progress"])

        if (!pendingCount || pendingCount === 0) continue

        const { updated, cancelled, errors } = await fetchAndApplyResults(supabase, round.gm_ts)
        if (updated > 0 || cancelled > 0) {
          resultsFetched += updated
          resultsCancelled += cancelled
          actions.push(
            `results_fetched: gmTs=${round.gm_ts} (${updated} updated, ${cancelled} cancelled)`
          )
        }
        resultErrors.push(...errors)
      }
    }

    // 결과가 새로 입력된 게임에 대해 자동 정산 실행
    let autoSettleResult = null
    if (resultsFetched > 0 || resultsCancelled > 0) {
      try {
        const { settlePredictions } = await import("@/lib/betman/settle")

        const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
        const { data: recentlyUpdatedGames } = await supabase
          .from("betman_games")
          .select(
            "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
          )
          .in("status", ["completed", "cancelled"])
          .not("result", "is", null)
          .gte("updated_at", fiveMinAgo)

        if (recentlyUpdatedGames && recentlyUpdatedGames.length > 0) {
          const gameIds = recentlyUpdatedGames.map((g) => g.id)
          const { data: predictions } = await supabase
            .from("betman_predictions")
            .select("id, user_id, game_id, prediction, status, slip_id, locked_odds, stake")
            .in("game_id", gameIds)
            .eq("status", "pending")

          if (predictions && predictions.length > 0) {
            autoSettleResult = await settlePredictions(supabase, recentlyUpdatedGames, predictions)
            actions.push(
              `auto_settled: ${autoSettleResult.settled} predictions (${autoSettleResult.correct} correct, ${autoSettleResult.wrong} wrong)`
            )
          }
        }
      } catch (settleErr) {
        actions.push(`auto_settle_error: ${(settleErr as Error).message}`)
      }
    }

    // ============================================
    // Phase 4: VPS에 urgent resync 신호 (DB 플래그)
    // ============================================
    if (isStale && directSyncResults.length === 0) {
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
    }

    // ============================================
    // Phase 5: 동기화 상태 업데이트
    // ============================================
    const totalGames = directSyncResults.reduce((sum, r) => sum + r.games, 0)

    if (directSyncResults.length > 0 && totalGames > 0) {
      const latestGmTs = directSyncResults[directSyncResults.length - 1].gmTs
      const activeGmTs = directSyncResults.map((r) => r.gmTs)
      await updateSyncState(supabase, latestGmTs, "watchdog_sync", totalGames, null, activeGmTs)
    } else if (!isStale) {
      await updateSyncState(supabase, null, "watchdog_ok", 0, null)
    }

    const duration = Date.now() - start

    return NextResponse.json({
      mode: "watchdog",
      isStale,
      isUrgent,
      hoursSinceSync: hoursSinceSync.toFixed(1),
      actions,
      directSyncResults,
      totalGames,
      results: {
        fetched: resultsFetched,
        cancelled: resultsCancelled,
        errors: resultErrors.length > 0 ? resultErrors : undefined,
      },
      autoSettle: autoSettleResult
        ? {
            settled: autoSettleResult.settled,
            correct: autoSettleResult.correct,
            wrong: autoSettleResult.wrong,
          }
        : null,
      duration: `${duration}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
