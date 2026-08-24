import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { getLfaDayIndex, getLfaMatchInfo } from "@/lib/lfa/match"
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

    // 경기 상세(스탯·타임라인)도 데운다 — day 목록만 살아나도 여기서 막히면 통계 탭이
    // 빈다 (2026-08-24 실측: details 도 캐시 미스면 120초). 오늘 매치센터 대상 리그의
    // **시작된 경기**만, 동시 3개씩. 종료분은 6시간 캐시라 하루 몇 번이면 충분하다.
    const fixtures = await getFixturesForDay(today).catch(() => [])
    // ⚠️ 슬롯 12개는 **진행 중일 법한 경기 먼저** (2026-08-25 실측 수정).
    //    종전엔 "시작된 경기" 를 시간순 앞에서 12개 잘랐다 — 바쁜 매치데이엔 그게
    //    몇 시간 전에 끝난 경기들이라, 정작 지금 뛰는 경기가 슬롯 밖으로 밀렸다.
    //    킥오프가 경기 창(3.5h) 안인 경기를 앞세우고, 나머지(종료분 스탯 대기)는 뒤에.
    const nowMs = Date.now()
    const inWindow = (f: (typeof fixtures)[number]) => {
      const ko = new Date(f.matchTime).getTime()
      return nowMs - ko <= 3.5 * 3600_000
    }
    const targets = fixtures
      .filter((f) => f.gameId && isMatchPageLeague(f.leagueCode))
      .filter((f) => new Date(f.matchTime).getTime() <= nowMs)
      .sort((a, b) => Number(inWindow(b)) - Number(inWindow(a)))
      .slice(0, 12)
    let warmed = 0
    for (let i = 0; i < targets.length; i += 3) {
      const chunk = targets.slice(i, i + 3)
      const done = await Promise.all(
        chunk.map((f) =>
          getLfaMatchInfo({
            gameId: f.gameId as string,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            matchTime: f.matchTime,
            leagueCode: f.leagueCode,
          })
            .then((info) => (info?.stats.length ?? 0) > 0)
            .catch(() => false)
        )
      )
      warmed += done.filter(Boolean).length
      // 남은 시간이 빠듯하면 멈춘다 — 다음 회차가 이어받는다
      if (Date.now() - start > 90_000) break
    }

    return NextResponse.json({
      mode: "lfa-warm",
      results,
      details: { targets: targets.length, warmed },
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("lfa-warm", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
