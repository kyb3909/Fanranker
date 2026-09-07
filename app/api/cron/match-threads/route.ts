import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { sweepMatchThreads } from "@/lib/match/thread"
import { internalFailures, isInternalThreadSkip } from "@/lib/match/sweep-outcome"

/**
 * GET /api/cron/match-threads — 2분마다. 확정 명단은 DB에서 재사용한다.
 *
 * 불판 자동 생성 스윕: 킥오프 90분 전~120분 후 창에서 라인업이 발표된(ready)
 * 매치센터 화이트리스트 경기에 "중계불판" 게시물을 깐다. 상세는 lib/match/thread.ts.
 *
 * `?gameId=` — 창 판정을 무시하고 그 경기만 시도 (수동 리허설·백필용.
 * 화이트리스트·라인업 ready 조건은 유지되므로 아무 경기나 깔리지는 않는다).
 *
 * 응답 코드 (2026-09-07): 경기별 skipped 중 **우리 장애**(형제·기존 글 조회 실패, 유니크 경합이
 * 아닌 삽입 오류)가 하나라도 있으면 503. 라인업 대기·기존 글·경합은 정상이라 200 이다.
 * 200 심박이 부분 장애를 가리던 것을 끝낸다 — cron_run_log 에 본문 앞 300자가 남는다.
 */
async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const forceGameId = request.nextUrl.searchParams.get("gameId") ?? undefined
    const result = await sweepMatchThreads(forceGameId ? { forceGameId } : undefined)
    const failures = internalFailures(result.skipped, isInternalThreadSkip)

    return NextResponse.json(
      {
        mode: "match-threads",
        success: failures.length === 0,
        ...result,
        failures,
        duration: `${Date.now() - start}ms`,
      },
      { status: failures.length ? 503 : 200 }
    )
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("match-threads", cronGet)

export async function POST(request: NextRequest) {
  return cronGet(request)
}
