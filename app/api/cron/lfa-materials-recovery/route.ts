import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { getBetmanFixturesForDay, kstDayRange, todayKst } from "@/lib/match/get-fixtures"
import { listSupplementalFixtures, supplementalSummary } from "@/lib/match/supplemental-fixtures"
import { recoverMatchMaterials } from "@/lib/match/recover-materials"

// Separate from date warming: a slow warmup must not consume recovery's entire execution budget.
export const maxDuration = 120

async function cronGet(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError
  const start = Date.now()
  try {
    const today = todayKst()
    const yesterday = new Date(new Date(`${today}T12:00:00+09:00`).getTime() - 86400_000)
      .toISOString()
      .slice(0, 10)
    const from = kstDayRange(yesterday)!.start
    const to = kstDayRange(today)!.end
    // Candidate discovery must be DB-only. Mapping and date-feed acquisition have other owners.
    const [todayRows, yesterdayRows, supplemental] = await Promise.all([
      getBetmanFixturesForDay(today),
      getBetmanFixturesForDay(yesterday),
      listSupplementalFixtures(from, to),
    ])
    const recovery = await recoverMatchMaterials(
      [...supplemental.map(supplementalSummary), ...todayRows, ...yesterdayRows],
      start
    )
    return NextResponse.json(
      { mode: "lfa-materials-recovery", ...recovery },
      { status: recovery.errors.length || recovery.deferred || recovery.pending ? 503 : 200 }
    )
  } catch (error) {
    return apiError("경기 자료 복구 중 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("lfa-materials-recovery", cronGet)
export const POST = GET
