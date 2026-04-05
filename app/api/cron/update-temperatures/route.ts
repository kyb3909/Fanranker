import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const maxDuration = 30
export const dynamic = "force-dynamic"

/**
 * POST /api/cron/update-temperatures
 *
 * 5분마다 실행: 7일 이내 게시물의 온도를 재계산 (시간 감쇠 반영)
 * pg_cron 대안으로 Vercel Cron에서 호출.
 *
 * vercel.json crons 설정: path="/api/cron/update-temperatures", schedule="every 5 min"
 */
export async function POST(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.rpc("update_active_post_temperatures")

  if (error) {
    console.error("Temperature update failed:", error.message)
    return NextResponse.json({ error: "온도 업데이트에 실패했습니다." }, { status: 500 })
  }

  return NextResponse.json({ updated: data, timestamp: new Date().toISOString() })
}
