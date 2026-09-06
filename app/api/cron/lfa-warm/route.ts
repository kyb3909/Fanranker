import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { getLfaDayIndex, createLfaRefreshSession } from "@/lib/lfa/match"
import { getFixturesForDay, todayKst } from "@/lib/match/get-fixtures"
import { isMatchPageLeague } from "@/lib/match/leagues"

/**
 * LFA 날짜 목록 워밍업 (2026-08-24 실사고 후속).
 *
 * ## 왜 필요한가
 * `matches?date=` 는 913KB 라 **LFA 서버 캐시가 비면 46초**가 걸린다(실측). 사용자 요청
 * 경로에서 그걸 기다릴 수는 없고, 기다리지 않으면 매번 중간에 끊겨 **서버 캐시가 영영
 * 안 데워진다** — 그 악순환이 라인업·스탯·타임라인·불판을 한꺼번에 죽이고 있었다.
 *
 * 그래서 cron 이 먼저 한 번 맞는다. 데워두면 사용자 요청은 0.5초 히트를 만난다.
 * 오늘·내일 두 날짜만 — 지난 날은 이미 굳었고 우리 캐시가 12시간 들고 있다.
 *
 * ⚠️ 이 라우트는 46초를 기다릴 수 있어야 하므로 maxDuration 을 넉넉히 잡는다.
 *    호출은 날짜당 1크레딧이라 15분 주기여도 하루 192크레딧뿐이다.
 */
export const maxDuration = 120

async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const today = todayKst()
    const tomorrow = new Date(new Date(`${today}T12:00:00+09:00`).getTime() + 24 * 3600_000)
      .toISOString()
      .slice(0, 10)

    const results: { date: string; entries: number; ms: number }[] = []
    for (const d of [today, tomorrow]) {
      const t0 = Date.now()
      const index = await getLfaDayIndex(d).catch(() => new Map())
      results.push({ date: d, entries: index.size, ms: Date.now() - t0 })
    }

    // 실황은 lfa-live가 소유한다. 여기서는 킥오프 +4h 이후 미완성 상세만 보충한다.
    // 한 실행 24경기/동시 6개/90초 시작 제한. 완전한 종료 저장분은 재구매하지 않는다.
    const fixtures = await getFixturesForDay(today).catch(() => [])
    // 매치데이 06:00 경계 뒤에도 이전 경기의 빈 상세 재시도 창(+6h)을 유지한다.
    const yesterday = new Date(new Date(`${today}T12:00:00+09:00`).getTime() - 24 * 3600_000)
      .toISOString()
      .slice(0, 10)
    const tail = (await getFixturesForDay(yesterday).catch(() => [])).filter(
      (f) => Date.now() - new Date(f.matchTime).getTime() <= 6 * 3600_000
    )
    const nowMs = Date.now()
    const targets = [...fixtures, ...tail]
      .filter((f) => f.gameId && isMatchPageLeague(f.leagueCode))
      .filter((f) => new Date(f.matchTime).getTime() <= nowMs)
      // 킥오프~+4h 실황은 lfa-live(3분)가 소유한다. warm은 이후의 미완성 상세를 보충한다.
      .filter((f) => nowMs - new Date(f.matchTime).getTime() > 4 * 3600_000)
      .sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
      .slice(0, 24)
    let warmed = 0
    const errors: string[] = []
    const refresh = createLfaRefreshSession()
    for (let i = 0; i < targets.length; i += 6) {
      const chunk = targets.slice(i, i + 6)
      const done = await Promise.all(
        chunk.map((f) =>
          refresh({
            gameId: f.gameId as string,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            matchTime: f.matchTime,
            leagueCode: f.leagueCode,
          })
            .then(({ info }) => info.stats.length > 0)
            .catch(() => {
              errors.push(f.gameId as string)
              return false
            })
        )
      )
      warmed += done.filter(Boolean).length
      // 남은 시간이 빠듯하면 멈춘다 — 다음 회차가 이어받는다
      if (Date.now() - start > 90_000) break
    }

    return NextResponse.json(
      {
        mode: "lfa-warm",
        results,
        details: { targets: targets.length, warmed, errors },
        duration: `${Date.now() - start}ms`,
      },
      { status: errors.length ? 503 : 200 }
    )
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("lfa-warm", cronGet)
export const POST = GET
