import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { learnDeskRevision } from "@/lib/news/desk/service"
import { refillLiveDesk } from "@/lib/news/desk/auto-queue"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const GET = withCronLog("news-desk", async (req: NextRequest) => {
  const authError = verifyCronSecret(req)
  if (authError) return authError
  const db = createServiceRoleClient()
  const learning = await learnDeskRevision(db)
  const generation = await refillLiveDesk(db)
  return NextResponse.json(
    { learning, generation },
    {
      status: "error" in generation || "error" in learning ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    }
  )
})
