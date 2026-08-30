import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { getFixturesForDay, todayKst } from "@/lib/match/get-fixtures"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { isReportWorthyMatch } from "@/lib/soccerway/report-clubs"
import { getMatchExtras, hasStoredReport } from "@/lib/soccerway/match-extras"

/**
 * 매치 리포트 자동 생성 (2026-08-30).
 *
 * ## 왜 필요한가
 * 리포트를 만드는 경로가 **사람이 페이지를 여는 것**뿐이었다. `getMatchExtras` 를 부르는
 * 곳이 매치 페이지 렌더와 `saga-match-review`(사가에 걸린 경기만) 둘이라, 아무도 안 열고
 * 사가에도 안 걸린 경기는 리포트가 영영 안 생긴다. 실측(2026-08-30): 3일간 라인업 119건
 * 대비 리포트 9건. 대상 구단 필터(`isReportWorthyMatch`)로 좁는 건 설계지만, **대상인데도
 * 안 만들어지는 것**은 다른 문제다.
 * 운영자: "경기가 끝나면 매치 리포트는 soccerway 리포트를 기반으로 제작이 된다."
 * 그 문장이 참이 되려면 트리거가 사람이 아니라 서버여야 한다.
 *
 * ## 24시간 창 — 이 크론의 존재 이유이자 제약
 * soccerway 해석(`resolveMatchEvent`)에 **킥오프 +24시간** 창이 걸려 있다. 창을 넘기면
 * 원문을 못 찾아 리포트를 영영 못 만든다. 그래서 "언젠가 돌면 된다"가 아니라 **끝난 당일에
 * 쓸어담아야** 한다. 30분 주기는 거기서 나온 값이다.
 *
 * ## 비용·시간
 * 리포트 1건 = soccerway 본문 1회 + LLM(작성 gpt-5.1 + 검증 terra). LFA 크레딧은
 * `getMatchExtras` 안에서 저장분·대상구단 검사로 먼저 끊긴다 — 이미 만든 경기는 0원이다.
 * 회차당 3건으로 묶고 90초를 넘기면 멈춘다. 남은 건 다음 회차가 이어받는다.
 */
export const maxDuration = 120

/** 회차당 새로 만들 리포트 수 — 늘리기 전에 maxDuration 과 LLM 지연을 같이 볼 것 */
const MAX_PER_RUN = 3
const TIME_BUDGET_MS = 90_000

async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    // 오늘·어제 매치데이 — 24시간 창을 덮는 최소 범위다
    const today = todayKst()
    const yesterday = new Date(new Date(`${today}T12:00:00+09:00`).getTime() - 24 * 3600_000)
      .toISOString()
      .slice(0, 10)

    const fixtures = (
      await Promise.all([
        getFixturesForDay(today).catch(() => []),
        getFixturesForDay(yesterday).catch(() => []),
      ])
    ).flat()

    const nowMs = Date.now()
    const targets = fixtures.filter((f) => {
      if (!f.gameId || f.status !== "completed") return false
      if (!isMatchPageLeague(f.leagueCode)) return false
      if (!isReportWorthyMatch(f.homeTeam, f.awayTeam)) return false
      // 창 밖이면 어차피 원문을 못 찾는다 — 부르면 헛돈만 쓴다
      const age = nowMs - new Date(f.matchTime).getTime()
      return age > 0 && age < 24 * 3600_000
    })

    let made = 0
    let skipped = 0
    const failed: string[] = []
    for (const f of targets) {
      if (made >= MAX_PER_RUN || Date.now() - start > TIME_BUDGET_MS) break
      if (await hasStoredReport(f.gameId as string).catch(() => true)) {
        skipped++
        continue
      }
      // 실패해도 다음 경기로 넘어간다 — 한 경기의 원문 부재가 스윕을 멈추면 안 된다
      const extras = await getMatchExtras(f.gameId as string).catch(() => null)
      if (extras?.report) made++
      else failed.push(`${f.homeTeam} vs ${f.awayTeam}`)
    }

    return NextResponse.json({
      mode: "match-reports",
      candidates: targets.length,
      made,
      alreadyStored: skipped,
      failed,
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("match-reports", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
