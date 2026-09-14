import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { reserveDeskDraft, generateDeskDraft, learnDeskRevision } from "@/lib/news/desk/service"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const GET = withCronLog("news-desk", async (req: NextRequest) => {
  const authError = verifyCronSecret(req)
  if (authError) return authError
  const db = createServiceRoleClient()
  const learning = await learnDeskRevision(db)
  const reservation = await reserveDeskDraft(db)
  const generation = await generateDeskDraft(db, reservation)
  return NextResponse.json(
    { learning, generation },
    {
      status: "error" in generation || "error" in learning ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    }
  )
})
