import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { broadcastRoomClosed } from "@/lib/metaverse/realtime/server-broadcast"

export const dynamic = "force-dynamic"

const INACTIVITY_MS = 2 * 60 * 60 * 1000 // 2시간

/**
 * POST /api/cron/metaverse-cleanup-rooms
 * 빈 방 (last_activity_at 이 2시간 이상 경과한) 자동 close + 각 방에 대해
 * 월드 채널에 room:closed broadcast. 현재 접속자는 Signboard 즉시 제거됨.
 *
 * CRON_SECRET Bearer 필수. vercel.json 에 등록되어 30분마다 실행.
 *
 * 기존 RPC (metaverse_cleanup_empty_chat_rooms) 는 count만 돌려주므로 여기선
 * 직접 UPDATE ... RETURNING plot_id 로 닫힌 방 목록을 받아 broadcast에 사용.
 */
export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const admin = createServiceRoleClient()
  const cutoff = new Date(Date.now() - INACTIVITY_MS).toISOString()

  const { data, error } = await admin
    .from("metaverse_chat_rooms")
    .update({ closed_at: new Date().toISOString() })
    .is("closed_at", null)
    .lt("last_activity_at", cutoff)
    .select("id, plot_id")

  if (error) {
    return NextResponse.json({ error: "cleanup_failed", detail: error.message }, { status: 500 })
  }

  const closed = data ?? []
  // Broadcast (best-effort, 병렬). 실패해도 다음 크론 또는 유저 reload로 복구.
  await Promise.allSettled(closed.map((r) => broadcastRoomClosed(r.plot_id)))

  return NextResponse.json({
    success: true,
    closed: closed.length,
    plotIds: closed.map((r) => r.plot_id),
  })
}
