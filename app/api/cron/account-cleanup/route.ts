import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { finishAccountDeletion } from "@/lib/account/deletion"

export const GET = withCronLog("account-cleanup", async (request: NextRequest) => {
  const denied = verifyCronSecret(request)
  if (denied) return denied
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from("account_deletion_requests")
      .select("user_id")
      .is("completed_at", null)
      .order("last_attempt_at", { ascending: true, nullsFirst: true })
      .limit(20)
    if (error) throw error
    let completed = 0
    for (const row of data ?? []) if (await finishAccountDeletion(db, row.user_id)) completed++
    const attempted = data?.length ?? 0
    return NextResponse.json(
      { attempted, completed, pending: attempted - completed },
      { status: attempted === completed ? 200 : 503 }
    )
  } catch (error) {
    return apiError("탈퇴 후속 처리에 실패했습니다.", 500, error)
  }
})
