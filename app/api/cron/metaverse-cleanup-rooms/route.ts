import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/metaverse-cleanup-rooms
 * 빈 방 (last_activity_at 2시간 경과) 자동 close.
 * CRON_SECRET Bearer 필수. Vercel Cron 또는 Vultr cron에서 호출.
 *
 * 현재 last_activity_at 갱신 경로가 없으므로 MVP 한계:
 *  모든 방은 생성 2시간 후 자동 close.
 *  Phase 3.6+ 에서 chat publish 시 touch endpoint로 갱신 예정.
 */
export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc("metaverse_cleanup_empty_chat_rooms")

  if (error) {
    return NextResponse.json({ error: "cleanup_failed", detail: error.message }, { status: 500 })
  }

  const closed = typeof data === "number" ? data : 0
  return NextResponse.json({ success: true, closed })
}
