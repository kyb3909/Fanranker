import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { runDraftRoomCleanup } from "@/lib/draft/multi-engine"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/draft-rooms-cleanup
 *
 * 매 5분마다 (vercel.json):
 *  - 30초 이상 disconnected 좌석 → AI 전환 + 시스템 메시지 + AI 차례면 자동 픽 chain
 *  - 30분 이상 대기 방 → abandoned
 *
 * CRON_SECRET Bearer 필수.
 */
export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  try {
    const summary = await runDraftRoomCleanup()
    return NextResponse.json({
      ok: true,
      ...summary,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: "cleanup_failed",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 }
    )
  }
}

// Vercel cron는 GET 도 호출 가능하게 (CRON_SECRET header 동일 검증).
export const GET = withCronLog("draft-rooms-cleanup", (req: NextRequest) => POST(req))
