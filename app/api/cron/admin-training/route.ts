import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { runTrainingJob } from "@/lib/news/training/jobs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
export const GET = withCronLog("admin-training", async (req: NextRequest) => {
  const error = verifyCronSecret(req)
  if (error) return error
  return NextResponse.json(await runTrainingJob(createServiceRoleClient()))
})
