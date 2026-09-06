import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { createLfaRefreshSession } from "@/lib/lfa/match"
import { readMatchDetails } from "@/lib/lfa/persist"
import { getFixturesForDay, todayKst } from "@/lib/match/get-fixtures"
import { isMatchPageLeague } from "@/lib/match/leagues"

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
    // 06:00 매치데이 경계의 진행/종료 전환을 놓치지 않는다.
    const fixtures = (
      await Promise.all([getFixturesForDay(today), getFixturesForDay(yesterday)])
    ).flat()
    const unique = new Map<string, (typeof fixtures)[number] & { gameId: string }>()
    for (const f of fixtures) {
      const elapsed = start - new Date(f.matchTime).getTime()
      if (
        !f.gameId ||
        !isMatchPageLeague(f.leagueCode) ||
        f.status === "cancelled" ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed > 4 * 3600_000
      )
        continue
      const key = `${f.leagueCode}|${new Date(f.matchTime).toISOString()}|${f.homeTeam}|${f.awayTeam}`
      if (!unique.has(key)) unique.set(key, { ...f, gameId: f.gameId })
    }
    // 오래된 경기부터: 시간 예산/24개 제한에 걸려도 같은 경기만 계속 선택하지 않는다.
    const candidates = await Promise.all(
      [...unique.values()].map(async (f) => ({
        fixture: f,
        stored: await readMatchDetails(f.gameId, f.matchTime),
      }))
    )
    const pending = candidates
      .filter(({ stored }) => !(stored?.info.finished && !stored.stale))
      .sort((a, b) => (a.stored?.updatedAt ?? 0) - (b.stored?.updatedAt ?? 0))
    const targets = pending.slice(0, 24)
    const refresh = createLfaRefreshSession()
    const results: { gameId: string; status: string; sourceUpdatedAt?: number }[] = []
    const errors: { gameId: string; reason: string }[] = []
    for (let i = 0; i < targets.length && Date.now() - start < 90_000; i += 6) {
      await Promise.all(
        targets.slice(i, i + 6).map(async ({ fixture }) => {
          try {
            const result = await refresh(fixture)
            results.push({
              gameId: fixture.gameId,
              status: result.status,
              sourceUpdatedAt: result.info.sourceUpdatedAt,
            })
          } catch (error) {
            errors.push({
              gameId: fixture.gameId,
              reason: error instanceof Error ? error.message : "lfa-refresh-failed",
            })
          }
        })
      )
    }
    const deferred = pending.length - results.length - errors.length
    // 부분 실패/시간 예산 초과를 HTTP 200 심박으로 숨기지 않는다. 성공 경기 결과는 유지한다.
    return NextResponse.json(
      { mode: "lfa-live", targets: pending.length, results, errors, deferred },
      { status: errors.length || deferred ? 503 : 200 }
    )
  } catch (error) {
    return apiError("실황 갱신 중 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("lfa-live", cronGet)
export const POST = GET
