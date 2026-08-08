// Betman Sync Watchdog Edge Function — 3차 안전장치: 동기화 상태 감시 및 자동 복구.
//
// 2026-08-08 감사 P2-1: 배포본은 있는데 소스가 리포 어디에도 없어 재구축 불가였던
// 것을 라이브에서 회수해 채록 (mcp get_edge_function, version 1, sha256 148b9f4f…).
// 트리거: pg_cron `betman-sync-watchdog-trigger` (매시 :15 — supabase/migrations/
// 20260808e_transcribe_pg_cron_jobs.sql 참조). 시크릿은 전부 Edge 런타임 env 주입.
// 재배포: supabase functions deploy betman-sync-watchdog
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000
const URGENT_THRESHOLD_MS = 6 * 60 * 60 * 1000

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const vercelApiUrl = Deno.env.get("VERCEL_API_URL") || ""
    const cronSecret = Deno.env.get("CRON_SECRET") || ""

    const supabase = createClient(supabaseUrl, supabaseKey)
    const actions: string[] = []
    const now = new Date()

    // 1. sync_state 확인
    const { data: syncState } = await supabase
      .from("betman_sync_state")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let isStale = false
    let isUrgent = false
    let hoursSinceSync = 0

    if (syncState?.last_checked_at) {
      const lastCheck = new Date(syncState.last_checked_at)
      const elapsed = now.getTime() - lastCheck.getTime()
      hoursSinceSync = elapsed / (1000 * 60 * 60)
      isStale = elapsed > STALE_THRESHOLD_MS
      isUrgent = elapsed > URGENT_THRESHOLD_MS
    } else {
      isUrgent = true
    }

    actions.push(`sync_age: ${hoursSinceSync.toFixed(1)}h, stale=${isStale}, urgent=${isUrgent}`)

    // 2. 라운드 상태 정리: open인데 scheduled 게임 없으면 closed
    const { data: openRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .eq("status", "open")

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
          actions.push(`round_closed: ${round.gm_ts}`)
        }
      }
    }

    // 3. stale이면 Vercel cron 트리거
    if (isStale && vercelApiUrl && cronSecret) {
      try {
        const resp = await fetch(`${vercelApiUrl}/api/cron/betman-sync`, {
          method: "GET",
          headers: { Authorization: `Bearer ${cronSecret}` },
        })
        const result = await resp.json()
        actions.push(`vercel_triggered: status=${resp.status}, games=${result.totalGames || 0}`)
      } catch (e) {
        actions.push(`vercel_trigger_failed: ${(e as Error).message}`)
      }
    }

    // 4. urgent이면 DB에 resync 플래그
    if (isUrgent) {
      const latestGmTs = syncState?.latest_gm_ts
      if (latestGmTs) {
        const current = parseInt(latestGmTs, 10)
        if (!isNaN(current)) {
          const resyncFlag = {
            needs_resync: true,
            requested_at: now.toISOString(),
            reason: "edge_function_urgent",
            hours_since_sync: hoursSinceSync,
            probe_range_start: String(current + 1),
            probe_range_end: String(current + 5),
          }

          if (syncState?.id) {
            await supabase
              .from("betman_sync_state")
              .update({
                last_error: JSON.stringify(resyncFlag),
                last_sync_action: "edge_watchdog_urgent",
                updated_at: now.toISOString(),
              })
              .eq("id", syncState.id)
            actions.push(`resync_flagged: probe ${current + 1} to ${current + 5}`)
          }
        }
      }
    }

    const summary = {
      timestamp: now.toISOString(),
      syncState: {
        latestGmTs: syncState?.latest_gm_ts,
        lastAction: syncState?.last_sync_action,
        lastChecked: syncState?.last_checked_at,
        hoursSinceSync: hoursSinceSync.toFixed(1),
      },
      status: isUrgent ? "URGENT" : isStale ? "STALE" : "OK",
      openRounds: openRounds?.length || 0,
      actions,
    }

    return new Response(JSON.stringify(summary), {
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
