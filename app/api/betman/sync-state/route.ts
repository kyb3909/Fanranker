import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const syncStatePostSchema = z.object({
  latestGmTs: z.union([z.string(), z.number()]).transform(String).optional(),
  activeRounds: z.array(z.string()).optional(),
  lastSyncAction: z.string().optional(),
  lastSyncGamesCount: z.number().optional(),
  lastError: z.union([z.string(), z.null()]).optional(),
})

/**
 * GET /api/betman/sync-state
 *
 * Returns the current sync state from DB.
 * Used by betman-sync.ts and betman-fetch-results.ts to get latestGmTs.
 *
 * Auth: CRON_SECRET Bearer token
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("betman_sync_state")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json({ error: "sync 상태를 조회할 수 없습니다." }, { status: 500 })
    }

    return NextResponse.json({
      latestGmTs: data.latest_gm_ts,
      activeRounds: data.active_rounds,
      lastCheckedAt: data.last_checked_at,
      lastSyncAction: data.last_sync_action,
      lastSyncGamesCount: data.last_sync_games_count,
      lastError: data.last_error,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}

/**
 * POST /api/betman/sync-state
 *
 * Updates the sync state in DB.
 * Called by betman-sync.ts after each sync operation.
 *
 * Body: {
 *   latestGmTs: string,
 *   activeRounds?: string[],
 *   lastSyncAction?: string,       // 'created' | 'updated' | 'checked'
 *   lastSyncGamesCount?: number,
 *   lastError?: string | null,
 * }
 *
 * Auth: CRON_SECRET Bearer token
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const rawBody = await request.json().catch(() => null)
    const parsed = syncStatePostSchema.safeParse(rawBody ?? {})
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const body = parsed.data

    const supabase = createServiceRoleClient()

    // Get existing row
    const { data: existing } = await supabase
      .from("betman_sync_state")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    const updateData: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (body.latestGmTs != null) {
      updateData.latest_gm_ts = body.latestGmTs
    }
    if (body.activeRounds != null) {
      updateData.active_rounds = body.activeRounds
    }
    if (body.lastSyncAction != null) {
      updateData.last_sync_action = body.lastSyncAction
    }
    if (body.lastSyncGamesCount != null) {
      updateData.last_sync_games_count = body.lastSyncGamesCount
    }
    if (body.lastError !== undefined) {
      updateData.last_error = body.lastError
    }

    if (existing) {
      const { error } = await supabase
        .from("betman_sync_state")
        .update(updateData)
        .eq("id", existing.id)

      if (error) {
        return NextResponse.json({ error: "sync 상태 업데이트 실패" }, { status: 500 })
      }
    } else {
      // First run — insert
      const { error } = await supabase.from("betman_sync_state").insert(updateData)

      if (error) {
        return NextResponse.json({ error: "sync 상태 생성 실패" }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
